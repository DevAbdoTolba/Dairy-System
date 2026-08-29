"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PosBootstrap } from "../application/pos-service";
import {
  quantityFromParts,
  quantityPartsFromUnits,
  formatQuantityArabic,
} from "../domain/quantity";
import { nextSupplierTokens, suppliersMatchingTokens } from "../domain/trie";
import type { MilkType, ShiftType } from "../domain/shift";
import type { Role } from "@/modules/auth/domain/role";
import { formatArabicDate } from "@/shared/dates/business-date";
import {
  cachePosWorkspace,
  persistSupplierClose,
  persistSupplierWorkspaceCommand,
  readCachedPosWorkspace,
  syncPersistedSupplierCommand,
  flushSupplierOutbox,
  type SupplierEndpoint,
} from "@/shared/offline/supplier-offline";
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

function piastersFromEgp(value: string) {
  const normalized = value.trim().replace("٫", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function PosWorkspace({
  businessDate,
  credentialRole,
}: {
  businessDate: string;
  credentialRole: Role;
}) {
  const [data, setData] = useState<PosBootstrap | null>(null);
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
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const loadBootstrap = useCallback(
    async (shiftId: string) => {
      const response = await fetch(`/api/pos/bootstrap?shiftId=${encodeURIComponent(shiftId)}`, {
        cache: "no-store",
      });
      const result = await json<PosBootstrap>(response);
      if (!response.ok) throw new Error(result.error ?? "تعذر تحميل بيانات الوردية.");
      if (result.posCredentialVersion)
        await invalidatePosVerifierIfVersionChanged(result.posCredentialVersion, credentialRole);
      setData(result);
      await cachePosWorkspace(result);
    },
    [credentialRole],
  );

  useEffect(() => {
    void readCachedPosWorkspace<PosBootstrap>().then((cached) => {
      if (cached?.shift.businessDate !== businessDate) return;
      setData(cached);
      if (navigator.onLine) void loadBootstrap(cached.shift.id).catch(() => undefined);
    });
  }, [businessDate, loadBootstrap]);

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

  function enterFullscreen() {
    if (document.fullscreenEnabled && !document.fullscreenElement)
      void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  async function openShift(type: ShiftType) {
    enterFullscreen();
    setBusy(true);
    setError(null);
    try {
      const cached = await readCachedPosWorkspace<PosBootstrap>();
      const shiftId = requestId();
      const localData: PosBootstrap = {
        shift: {
          id: shiftId,
          businessDate,
          type,
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
        payload: { commandId: requestId(), shiftId, businessDate, type },
      });
      setData(localData);
      const result = await syncPersistedSupplierCommand<{ shift: { id: string } }>(entry);
      if (result.status === "synced" && result.data) await loadBootstrap(result.data.shift.id);
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
      if (!(await verifyLocalPosPin(closePin, credentialRole))) {
        setError(credentialRole === "OWNER" ? "رمز المالك غير صحيح." : "رمز الاستلام غير صحيح.");
        return;
      }
      const snapshot = await createLocalShiftSnapshot(data);
      const localData: PosBootstrap = {
        ...data,
        shift: {
          ...data.shift,
          status: "CLOSED",
          closedAt: snapshot.payload.closedAt,
          closedByRole: credentialRole,
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إغلاق الوردية.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Stack
        component="section"
        spacing={2}
        sx={{
          minHeight: "calc(100vh - 64px)",
          maxWidth: 560,
          mx: "auto",
          justifyContent: "center",
        }}
      >
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography component="h1" variant="h2" sx={{ textAlign: "center", mb: 2 }}>
            {formatArabicDate(businessDate)}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Grid container spacing={1.5}>
            {(Object.keys(shiftLabels) as ShiftType[]).map((type) => (
              <Grid key={type} size={{ xs: 6 }}>
                <Button
                  type="button"
                  fullWidth
                  variant="outlined"
                  disabled={busy}
                  onClick={() => openShift(type)}
                  sx={{
                    minHeight: { xs: 160, sm: 200 },
                    fontSize: { xs: "1.25rem", sm: "1.5rem" },
                  }}
                >
                  {type === "MORNING" ? "صباحية" : "مسائية"}
                </Button>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack component="section" spacing={1.25} sx={{ minHeight: "calc(100vh - 48px)" }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Grid container spacing={1.5} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12 }}>
          <Paper
            component="section"
            aria-label="اختيار المورد"
            sx={{
              p: { xs: 1.5, sm: 2 },
              minHeight: selectedSupplier ? "auto" : "calc(100vh - 70px)",
            }}
          >
            <Stack spacing={1.5}>
              <Paper aria-label="المورد المختار" variant="outlined" sx={{ p: 1.5, minHeight: 64 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography component="h1" variant="h2" sx={{ flexGrow: 1 }}>
                    {selectedSupplier?.displayName ?? "\u00a0"}
                  </Typography>
                  {selectedSupplier && (
                    <>
                      <Button type="button" variant="text" onClick={finishSupplier}>
                        إنهاء
                      </Button>
                      <Button type="button" variant="text" onClick={() => setHistoryOpen(true)}>
                        آخر الحركات
                      </Button>
                      {data.shift.status === "OPEN" && (
                        <Button
                          type="button"
                          color="warning"
                          variant="text"
                          disabled={busy}
                          onClick={() => setCloseDialogOpen(true)}
                        >
                          إغلاق
                        </Button>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
              <Stack
                direction="row"
                spacing={0.75}
                useFlexGap
                sx={{ minHeight: 44, flexWrap: "wrap" }}
              >
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
              <Box>
                {!selectedSupplier && prefix.length > 0 && (
                  <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
                    <Button
                      type="button"
                      size="small"
                      startIcon={<ReplayOutlinedIcon />}
                      onClick={() => setPrefix([])}
                    >
                      من البداية
                    </Button>
                  </Stack>
                )}
                {!selectedSupplier && (
                  <Grid container spacing={1}>
                    {nextTokens.map((token) => (
                      <Grid key={token} size={{ xs: 6, sm: 4, md: 3 }}>
                        <Button
                          type="button"
                          fullWidth
                          variant="outlined"
                          onClick={() => chooseToken(token)}
                          sx={{ minHeight: { xs: 72, sm: 88 }, fontSize: "1.1rem" }}
                        >
                          {token}
                        </Button>
                      </Grid>
                    ))}
                  </Grid>
                )}
                {!selectedSupplier && matchingSuppliers.length > 1 && nextTokens.length === 0 && (
                  <Grid container spacing={1} sx={{ mt: 0.25 }}>
                    {matchingSuppliers.map((supplier) => (
                      <Grid key={supplier.id} size={{ xs: 6, sm: 4, md: 3 }}>
                        <Button
                          type="button"
                          fullWidth
                          variant="outlined"
                          onClick={() => selectSupplier(supplier.id)}
                          sx={{ minHeight: { xs: 72, sm: 88 }, fontSize: "1.1rem" }}
                        >
                          {supplier.displayName}
                        </Button>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Stack>
          </Paper>
        </Grid>
        {selectedSupplier && (
          <Grid size={{ xs: 12 }}>
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
                  {selectedSupplier.posInstruction && (
                    <Alert severity="info">{selectedSupplier.posInstruction}</Alert>
                  )}
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
        )}
      </Grid>
      <Dialog
        open={historyOpen}
        onClose={() => !busy && setHistoryOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>آخر الحركات</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={0.75}>
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
                      onClick={() => {
                        setHistoryOpen(false);
                        startEdit(entry);
                      }}
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
                  <Typography sx={{ flexGrow: 1 }}>
                    {movement.supplierName} · نقد مسجل للمورد
                  </Typography>
                </Stack>
              ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setHistoryOpen(false)}>
            إغلاق
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={closeDialogOpen} onClose={() => !busy && setCloseDialogOpen(false)}>
        <DialogTitle>إغلاق الوردية</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              {credentialRole === "OWNER"
                ? "أدخل رمز المالك مرة أخرى. سيحفظ الجهاز لقطة إغلاق موقعة ويجعل الوردية للقراءة فقط."
                : "أدخل رمز الاستلام مرة أخرى. سيحفظ الجهاز لقطة إغلاق موقعة ويجعل الوردية للقراءة فقط."}
            </Typography>
            <TextField
              autoFocus
              label={credentialRole === "OWNER" ? "رمز المالك" : "رمز الاستلام"}
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
