"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PosBootstrap } from "../application/pos-service";
import {
  quantityFromParts,
  quantityPartsFromUnits,
  formatQuantityArabic,
} from "../domain/quantity";
import { nextSupplierTokens, suppliersMatchingTokens } from "../domain/trie";
import type { MilkType, ShiftType } from "../domain/shift";
import { formatArabicDate } from "@/shared/dates/business-date";
import {
  cachePosWorkspace,
  persistSupplierClose,
  persistSupplierWorkspaceCommand,
  readCachedPosWorkspace,
  syncPersistedSupplierCommand,
  flushSupplierOutbox,
  listSupplierOutbox,
  type SupplierEndpoint,
} from "@/shared/offline/supplier-offline";
import { listenForQueueChanges } from "@/shared/offline/offline-store";
import {
  createLocalShiftSnapshot,
  downloadLocalShiftSnapshot,
  invalidatePosVerifierIfVersionChanged,
  verifyLocalPosPin,
} from "@/shared/offline/pos-close";

type TimelineEntry = PosBootstrap["entries"][number];
type CashRecord = PosBootstrap["cashRecords"][number];

const shiftLabels: Record<ShiftType, string> = { MORNING: "وردية صباحية", NIGHT: "وردية مسائية" };
const milkLabels: Record<MilkType, string> = { COW: "لبن بقري", BUFFALO: "لبن جاموسي" };

function requestId() {
  return crypto.randomUUID();
}

async function json<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string };
}

function cairoTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function currentConnection() {
  return navigator.onLine;
}

function piastersFromEgp(value: string) {
  const normalized = value.trim().replace("٫", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function PosWorkspace({ businessDate }: { businessDate: string }) {
  const [data, setData] = useState<PosBootstrap | null>(null);
  const [selectedShiftType, setSelectedShiftType] = useState<ShiftType>("MORNING");
  const [prefix, setPrefix] = useState<string[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [milkType, setMilkType] = useState<MilkType>("COW");
  const [satls, setSatls] = useState(0);
  const [cups, setCups] = useState(0);
  const [quarters, setQuarters] = useState(0);
  const [cashEgp, setCashEgp] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closePin, setClosePin] = useState("");
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const online = useSyncExternalStore(subscribeToConnection, currentConnection, () => true);

  const selectedSupplier =
    data?.suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const matchingSuppliers = useMemo(
    () => (data ? suppliersMatchingTokens(data.suppliers, prefix) : []),
    [data, prefix],
  );
  const nextTokens = useMemo(
    () => (data ? nextSupplierTokens(data.suppliers, prefix) : []),
    [data, prefix],
  );

  const loadBootstrap = useCallback(async (shiftId: string) => {
    const response = await fetch(`/api/pos/bootstrap?shiftId=${encodeURIComponent(shiftId)}`, {
      cache: "no-store",
    });
    const result = await json<PosBootstrap>(response);
    if (!response.ok) throw new Error(result.error ?? "تعذر تحميل بيانات الوردية.");
    if (result.posCredentialVersion)
      await invalidatePosVerifierIfVersionChanged(result.posCredentialVersion);
    setData(result);
    await cachePosWorkspace(result);
  }, []);

  const refreshOutbox = useCallback(() => {
    void listSupplierOutbox()
      .then((entries) => {
        setPendingSyncCount(entries.filter((entry) => entry.state === "pending").length);
        setFailedSyncCount(entries.filter((entry) => entry.state === "failed").length);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void readCachedPosWorkspace<PosBootstrap>().then((cached) => {
      if (cached?.shift.businessDate !== businessDate) return;
      setData(cached);
      if (navigator.onLine) void loadBootstrap(cached.shift.id).catch(() => undefined);
    });
  }, [businessDate, loadBootstrap]);

  useEffect(() => {
    refreshOutbox();
    return listenForQueueChanges(refreshOutbox);
  }, [refreshOutbox]);

  useEffect(() => {
    const syncWhenOnline = () => {
      if (!data?.shift.id || !navigator.onLine) return;
      void flushSupplierOutbox().then((result) => {
        if (result.synced > 0) void loadBootstrap(data.shift.id).catch(() => undefined);
      });
    };
    window.addEventListener("online", syncWhenOnline);
    return () => window.removeEventListener("online", syncWhenOnline);
  }, [data?.shift.id, loadBootstrap]);

  async function openShift() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const cached = await readCachedPosWorkspace<PosBootstrap>();
      const shiftId = requestId();
      const localData: PosBootstrap = {
        shift: {
          id: shiftId,
          businessDate,
          type: selectedShiftType,
          status: "OPEN",
          openedAt: new Date().toISOString(),
          closedAt: null,
          closedByRole: null,
          snapshotHash: null,
        },
        suppliers: cached?.suppliers ?? [],
        suggestions: cached?.suggestions ?? [],
        entries: [],
        cashRecords: [],
      };
      if (!navigator.onLine && localData.suppliers.length === 0)
        throw new Error(
          "يجب فتح شاشة الاستلام مرة واحدة بالإنترنت لحفظ قائمة الموردين على هذا الجهاز.",
        );
      const entry = await persistSupplierWorkspaceCommand(localData, {
        id: requestId(),
        endpoint: "/api/supplier-shifts",
        method: "POST",
        payload: { commandId: requestId(), shiftId, businessDate, type: selectedShiftType },
      });
      setData(localData);
      const result = await syncPersistedSupplierCommand<{ shift: { id: string } }>(entry);
      if (result.status === "synced" && result.data) await loadBootstrap(result.data.shift.id);
      setMessage(
        result.status === "synced"
          ? "تم فتح الوردية ومزامنتها."
          : "تم حفظ الوردية على الجهاز بانتظار المزامنة.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح الوردية.");
    } finally {
      setBusy(false);
    }
  }

  function chooseToken(token: string) {
    if (!data) return;
    const nextPrefix = [...prefix, token];
    const matches = suppliersMatchingTokens(data.suppliers, nextPrefix);
    setPrefix(nextPrefix);
    if (matches.length === 1) setSelectedSupplierId(matches[0].id);
  }

  function selectSupplier(supplierId: string) {
    setSelectedSupplierId(supplierId);
    setEditingEntry(null);
    setSatls(0);
    setCups(0);
    setQuarters(0);
    setPrefix([]);
    setMessage(null);
  }

  function finishSupplier() {
    setSelectedSupplierId(null);
    setPrefix([]);
    setEditingEntry(null);
    setSatls(0);
    setCups(0);
    setQuarters(0);
  }

  function startEdit(entry: TimelineEntry) {
    if (!data || entry.deletedAt) return;
    const supplier = data.suppliers.find((candidate) => candidate.id === entry.supplierId);
    if (!supplier) return;
    const parts = quantityPartsFromUnits(entry.quantityQuarterCupUnits);
    setSelectedSupplierId(supplier.id);
    setMilkType(entry.milkType);
    setSatls(parts.satls);
    setCups(parts.cups);
    setQuarters(parts.quarters);
    setEditingEntry(entry);
    setPrefix([]);
    setMessage("عدّل الكمية ثم احفظ التعديل.");
  }

  async function saveMilk() {
    if (!data || !selectedSupplier || data.shift.status !== "OPEN") return;
    setBusy(true);
    setError(null);
    try {
      const quantityQuarterCupUnits = quantityFromParts({ satls, cups, quarters });
      const createdAt = new Date().toISOString();
      const entryId = editingEntry?.id ?? requestId();
      const localEntry: TimelineEntry = editingEntry
        ? {
            ...editingEntry,
            quantityQuarterCupUnits,
            revision: editingEntry.revision + 1,
          }
        : {
            id: entryId,
            supplierId: selectedSupplier.id,
            supplierName: selectedSupplier.displayName,
            milkType,
            quantityQuarterCupUnits,
            revision: 1,
            createdAt,
            deletedAt: null,
          };
      const localData: PosBootstrap = {
        ...data,
        entries: editingEntry
          ? data.entries.map((entry) => (entry.id === editingEntry.id ? localEntry : entry))
          : [...data.entries, localEntry],
      };
      const endpoint: SupplierEndpoint = editingEntry
        ? `/api/supplier-shifts/${data.shift.id}/milk/${editingEntry.id}`
        : `/api/supplier-shifts/${data.shift.id}/milk`;
      const outboxEntry = await persistSupplierWorkspaceCommand(localData, {
        id: requestId(),
        endpoint,
        method: editingEntry ? "PUT" : "POST",
        payload: editingEntry
          ? {
              commandId: requestId(),
              expectedRevision: editingEntry.revision,
              quantityQuarterCupUnits,
            }
          : {
              commandId: requestId(),
              entryId,
              supplierId: selectedSupplier.id,
              milkType,
              quantityQuarterCupUnits,
            },
      });
      setData(localData);
      setEditingEntry(null);
      setSatls(0);
      setCups(0);
      setQuarters(0);
      const result = await syncPersistedSupplierCommand<{ entry: TimelineEntry }>(outboxEntry);
      if (result.status === "synced") await loadBootstrap(data.shift.id);
      setMessage(
        result.status === "synced"
          ? editingEntry
            ? "تم تعديل الحركة."
            : "تم حفظ اللبن."
          : "تم حفظ الحركة على الجهاز بانتظار المزامنة.",
      );
    } catch (caught) {
      setData(data);
      void cachePosWorkspace(data);
      setError(caught instanceof Error ? caught.message : "تعذر حفظ اللبن.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: TimelineEntry) {
    if (
      !data ||
      data.shift.status !== "OPEN" ||
      entry.deletedAt ||
      !window.confirm("حذف هذه الحركة من الوردية المفتوحة؟")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const localData: PosBootstrap = {
        ...data,
        entries: data.entries.map((candidate) =>
          candidate.id === entry.id
            ? {
                ...candidate,
                revision: candidate.revision + 1,
                deletedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      };
      const outboxEntry = await persistSupplierWorkspaceCommand(localData, {
        id: requestId(),
        endpoint: `/api/supplier-shifts/${data.shift.id}/milk/${entry.id}`,
        method: "DELETE",
        payload: { commandId: requestId(), expectedRevision: entry.revision },
      });
      setData(localData);
      const result = await syncPersistedSupplierCommand<{ entry: TimelineEntry }>(outboxEntry);
      if (result.status === "synced") await loadBootstrap(data.shift.id);
      setMessage(
        result.status === "synced"
          ? "تم حذف الحركة من الوردية المفتوحة."
          : "تم حفظ الحذف على الجهاز بانتظار المزامنة.",
      );
    } catch (caught) {
      setData(data);
      void cachePosWorkspace(data);
      setError(caught instanceof Error ? caught.message : "تعذر حذف الحركة.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCash() {
    if (!data || !selectedSupplier || data.shift.status !== "OPEN") return;
    const amountPiasters = piastersFromEgp(cashEgp);
    if (!amountPiasters) {
      setError("أدخل مبلغًا صحيحًا بالجنيه.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const movementId = requestId();
      const localRecord: CashRecord = {
        id: movementId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.displayName,
        amountPiasters,
        note: "",
        createdAt: new Date().toISOString(),
      };
      const localData: PosBootstrap = {
        ...data,
        cashRecords: [...data.cashRecords, localRecord],
      };
      const outboxEntry = await persistSupplierWorkspaceCommand(localData, {
        id: requestId(),
        endpoint: `/api/supplier-shifts/${data.shift.id}/cash`,
        method: "POST",
        payload: {
          commandId: requestId(),
          movementId,
          supplierId: selectedSupplier.id,
          amountPiasters,
        },
      });
      setData(localData);
      setCashEgp("");
      const result = await syncPersistedSupplierCommand<{ movement: { id: string } }>(outboxEntry);
      if (result.status === "synced") await loadBootstrap(data.shift.id);
      setMessage(
        result.status === "synced"
          ? "تم تسجيل النقد للمورد؛ سيظهر لصاحب المعمل للمراجعة."
          : "تم حفظ النقد على الجهاز بانتظار المزامنة.",
      );
    } catch (caught) {
      setData(data);
      void cachePosWorkspace(data);
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل النقد.");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!data || data.shift.status !== "OPEN") return;
    setBusy(true);
    setError(null);
    try {
      if (!(await verifyLocalPosPin(closePin))) {
        setError("رمز الاستلام غير صحيح.");
        return;
      }
      const snapshot = await createLocalShiftSnapshot(data);
      const localData: PosBootstrap = {
        ...data,
        shift: {
          ...data.shift,
          status: "CLOSED",
          closedAt: snapshot.payload.closedAt,
          closedByRole: "POS",
          snapshotHash: snapshot.checksum,
        },
      };
      const commandId = requestId();
      await persistSupplierClose(
        localData,
        {
          id: `${data.shift.id}:${snapshot.checksum}`,
          shiftId: data.shift.id,
          snapshot,
          createdAt: new Date().toISOString(),
        },
        {
          id: requestId(),
          endpoint: `/api/supplier-shifts/${data.shift.id}/close`,
          method: "POST",
          payload: { commandId, snapshot },
        },
      );
      setData(localData);
      setCloseDialogOpen(false);
      setClosePin("");
      downloadLocalShiftSnapshot({
        id: `${data.shift.id}:${snapshot.checksum}`,
        shiftId: data.shift.id,
        snapshot,
        createdAt: new Date().toISOString(),
      });
      const result = await flushSupplierOutbox();
      if (navigator.onLine && result.synced > 0) await loadBootstrap(data.shift.id);
      setMessage(
        navigator.onLine
          ? "تم حفظ إغلاق الوردية محليًا. ستكتمل المزامنة بالترتيب عند توفر الجلسة والاتصال."
          : "تم إغلاق الوردية وحفظ لقطة آمنة على الجهاز. ستتم المزامنة عند عودة الإنترنت.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إغلاق الوردية.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Paper component="main" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: "auto" }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography component="h1" variant="h1">
              استلام اللبن
            </Typography>
            <Typography color="text.secondary">{formatArabicDate(businessDate)}</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography component="h2" variant="h2">
            اختر الوردية
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {(Object.keys(shiftLabels) as ShiftType[]).map((type) => (
              <Button
                key={type}
                type="button"
                variant={selectedShiftType === type ? "contained" : "outlined"}
                aria-pressed={selectedShiftType === type}
                onClick={() => setSelectedShiftType(type)}
                sx={{ minHeight: 64, flex: 1 }}
              >
                {shiftLabels[type]}
              </Button>
            ))}
          </Stack>
          <Button
            type="button"
            variant="contained"
            disabled={busy}
            onClick={openShift}
            sx={{ minHeight: 64 }}
          >
            {busy ? "جارٍ الفتح…" : "بدء الوردية"}
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack component="main" spacing={1.5}>
      <Paper component="header" sx={{ p: 1.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Typography component="h1" variant="h2">
              {shiftLabels[data.shift.type]} · {formatArabicDate(data.shift.businessDate)}
            </Typography>
          </Box>
          <Chip
            color={online ? "success" : "warning"}
            label={online ? "متصل" : "محفوظ على الجهاز"}
          />
          {pendingSyncCount > 0 && (
            <Chip color="info" label={`${pendingSyncCount} بانتظار المزامنة`} />
          )}
          {failedSyncCount > 0 && <Chip color="error" label={`${failedSyncCount} تحتاج مراجعة`} />}
          <Chip
            variant="outlined"
            label={data.shift.status === "OPEN" ? "وردية مفتوحة" : "وردية مغلقة"}
          />
          {data.shift.status === "OPEN" && (
            <Button
              type="button"
              size="small"
              color="warning"
              variant="outlined"
              disabled={busy}
              onClick={() => setCloseDialogOpen(true)}
            >
              إغلاق الوردية
            </Button>
          )}
          <Button
            type="button"
            size="small"
            variant="outlined"
            onClick={() => {
              setData(null);
              finishSupplier();
            }}
          >
            تغيير الوردية
          </Button>
        </Stack>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      <Grid container spacing={1.5} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            component="aside"
            aria-label="اختيار المورد"
            sx={{ p: 1.5, height: { md: "100%" } }}
          >
            <Stack spacing={1.5}>
              <Box>
                <Typography component="h2" variant="h2">
                  المتوقع الآن
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                  {data.suggestions.map((supplier) => (
                    <Button
                      key={supplier.id}
                      type="button"
                      size="small"
                      variant="outlined"
                      onClick={() => selectSupplier(supplier.id)}
                    >
                      {supplier.displayName}
                    </Button>
                  ))}
                </Stack>
              </Box>
              <Divider />
              <Box>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography component="h2" variant="h2">
                    اختر المورد بالاسم
                  </Typography>
                  {prefix.length > 0 && (
                    <Button
                      type="button"
                      size="small"
                      startIcon={<ReplayOutlinedIcon />}
                      onClick={() => setPrefix([])}
                    >
                      من البداية
                    </Button>
                  )}
                </Stack>
                {prefix.length > 0 && (
                  <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                    {prefix.join(" ← ")}
                  </Typography>
                )}
                <Grid container spacing={1} sx={{ mt: 0.25 }}>
                  {nextTokens.map((token) => (
                    <Grid key={token} size={{ xs: 6 }}>
                      <Button
                        type="button"
                        fullWidth
                        variant="outlined"
                        onClick={() => chooseToken(token)}
                        sx={{ minHeight: 56 }}
                      >
                        {token}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
                {matchingSuppliers.length > 1 && nextTokens.length === 0 && (
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {matchingSuppliers.map((supplier) => (
                      <Button
                        key={supplier.id}
                        type="button"
                        variant="outlined"
                        onClick={() => selectSupplier(supplier.id)}
                      >
                        {supplier.displayName}
                      </Button>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper
            component="section"
            aria-label="تسجيل اللبن"
            sx={{ p: { xs: 2, sm: 2.5 }, minHeight: { md: 520 } }}
          >
            {!selectedSupplier ? (
              <Stack spacing={1} sx={{ justifyContent: "center", minHeight: { md: 440 } }}>
                <Typography component="h2" variant="h2">
                  اختر المورد أولاً
                </Typography>
                <Typography color="text.secondary">
                  استخدم الموردين المتوقعين أو كلمات الاسم الثابتة.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Box>
                    <Typography component="h2" variant="h1">
                      {selectedSupplier.displayName}
                    </Typography>
                    {selectedSupplier.posInstruction && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        {selectedSupplier.posInstruction}
                      </Alert>
                    )}
                  </Box>
                  <Button type="button" variant="outlined" onClick={finishSupplier}>
                    إنهاء المورد
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  {(Object.keys(milkLabels) as MilkType[]).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={milkType === type ? "contained" : "outlined"}
                      aria-pressed={milkType === type}
                      onClick={() => setMilkType(type)}
                      sx={{ minHeight: 60, flex: 1 }}
                    >
                      {milkLabels[type]}
                    </Button>
                  ))}
                </Stack>
                <QuantityPad
                  satls={satls}
                  cups={cups}
                  quarters={quarters}
                  onSatlsChange={setSatls}
                  onCupsChange={setCups}
                  onQuartersChange={setQuarters}
                />
                <Typography variant="h2">
                  الكمية:{" "}
                  {satls || cups || quarters
                    ? formatQuantityArabic(Math.max(1, satls * 24 + cups * 4 + quarters))
                    : "اختر الكمية"}
                </Typography>
                <Button
                  type="button"
                  variant="contained"
                  disabled={busy || data.shift.status !== "OPEN" || satls + cups + quarters === 0}
                  onClick={saveMilk}
                  sx={{ minHeight: 64 }}
                >
                  {busy
                    ? "جارٍ الحفظ…"
                    : editingEntry
                      ? "حفظ التعديل"
                      : `حفظ ${milkLabels[milkType]}`}
                </Button>
                {!editingEntry && (
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={() => setMilkType(milkType === "COW" ? "BUFFALO" : "COW")}
                  >
                    إضافة نوع اللبن الآخر لنفس المورد
                  </Button>
                )}
                <Divider />
                <Stack spacing={1} aria-label="تسجيل نقد للمورد">
                  <Typography component="h3" variant="h3">
                    نقد للمورد
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    يسجل المبلغ فقط، ولا تظهر أرصدة أو أسعار على شاشة الاستلام.
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {[10, 20, 50, 100].map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outlined"
                        disabled={busy || data.shift.status !== "OPEN"}
                        onClick={() => setCashEgp(String(amount))}
                        sx={{ minHeight: 48 }}
                      >
                        {amount} ج
                      </Button>
                    ))}
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      label="المبلغ بالجنيه"
                      value={cashEgp}
                      inputMode="decimal"
                      onChange={(event) => setCashEgp(event.target.value)}
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      type="button"
                      variant="outlined"
                      disabled={busy || !cashEgp || data.shift.status !== "OPEN"}
                      onClick={saveCash}
                      sx={{ minHeight: 56, minWidth: 132 }}
                    >
                      تسجيل النقد
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
      <Paper component="section" aria-label="آخر حركات الوردية" sx={{ p: 1.5 }}>
        <Typography component="h2" variant="h2" sx={{ mb: 1 }}>
          آخر حركات الوردية
        </Typography>
        <Stack spacing={0.75} sx={{ maxHeight: 220, overflowY: "auto" }}>
          {data.entries
            .filter((entry) => !entry.deletedAt)
            .slice()
            .reverse()
            .map((entry) => (
              <Stack
                key={entry.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { sm: "center" },
                  p: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                }}
              >
                <Typography sx={{ minWidth: 64 }}>{cairoTime(entry.createdAt)}</Typography>
                <Typography sx={{ flexGrow: 1 }}>
                  {entry.supplierName} · {milkLabels[entry.milkType]} ·{" "}
                  {formatQuantityArabic(entry.quantityQuarterCupUnits)}
                </Typography>
                <Stack direction="row" spacing={0.75}>
                  <Button
                    type="button"
                    size="small"
                    startIcon={<EditOutlinedIcon />}
                    disabled={busy || data.shift.status !== "OPEN"}
                    onClick={() => startEdit(entry)}
                  >
                    تعديل
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    disabled={busy || data.shift.status !== "OPEN"}
                    onClick={() => deleteEntry(entry)}
                  >
                    حذف
                  </Button>
                </Stack>
              </Stack>
            ))}
          {data.entries.filter((entry) => !entry.deletedAt).length === 0 && (
            <Typography color="text.secondary">لا توجد حركة في هذه الوردية بعد.</Typography>
          )}
          {data.cashRecords
            .slice()
            .reverse()
            .map((movement) => (
              <Stack
                key={movement.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { sm: "center" },
                  p: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                }}
              >
                <Typography sx={{ minWidth: 64 }}>{cairoTime(movement.createdAt)}</Typography>
                <Typography sx={{ flexGrow: 1 }}>
                  {movement.supplierName} · نقد مسجل للمورد
                </Typography>
              </Stack>
            ))}
        </Stack>
      </Paper>
      <Dialog open={closeDialogOpen} onClose={() => !busy && setCloseDialogOpen(false)}>
        <DialogTitle>إغلاق الوردية</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              أدخل رمز الاستلام مرة أخرى. سيحفظ الجهاز لقطة إغلاق موقعة ويجعل الوردية للقراءة فقط.
            </Typography>
            <TextField
              autoFocus
              label="رمز الاستلام"
              type="password"
              value={closePin}
              onChange={(event) => setClosePin(event.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={busy} onClick={() => setCloseDialogOpen(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="contained"
            color="warning"
            disabled={busy || !closePin}
            onClick={closeShift}
          >
            تأكيد الإغلاق
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function QuantityPad({
  satls,
  cups,
  quarters,
  onSatlsChange,
  onCupsChange,
  onQuartersChange,
}: {
  satls: number;
  cups: number;
  quarters: number;
  onSatlsChange: (value: number) => void;
  onCupsChange: (value: number) => void;
  onQuartersChange: (value: number) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography sx={{ minWidth: 72, fontWeight: 800 }}>السطل</Typography>
        <Button
          type="button"
          variant="outlined"
          onClick={() => onSatlsChange(Math.max(0, satls - 1))}
        >
          −
        </Button>
        <Typography variant="h2" sx={{ minWidth: 36, textAlign: "center" }}>
          {satls}
        </Typography>
        <Button type="button" variant="outlined" onClick={() => onSatlsChange(satls + 1)}>
          +
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography sx={{ minWidth: 72, fontWeight: 800 }}>الكوب</Typography>
        {[0, 1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            type="button"
            variant={cups === value ? "contained" : "outlined"}
            aria-pressed={cups === value}
            onClick={() => onCupsChange(value)}
          >
            {value}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography sx={{ minWidth: 72, fontWeight: 800 }}>الربع</Typography>
        {[0, 1, 2, 3].map((value) => (
          <Button
            key={value}
            type="button"
            variant={quarters === value ? "contained" : "outlined"}
            aria-pressed={quarters === value}
            onClick={() => onQuartersChange(value)}
          >
            {value === 0 ? "0" : `${value}/4`}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
