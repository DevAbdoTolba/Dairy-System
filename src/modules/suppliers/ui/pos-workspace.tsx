"use client";

import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import MoneyOffOutlinedIcon from "@mui/icons-material/MoneyOffOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fab from "@mui/material/Fab";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PosBootstrap } from "../application/pos-service";
import {
  formatQuantityArabic,
  quantityFromParts,
  quantityPartsFromUnits,
} from "../domain/quantity";
import { milkTypes, type MilkType, type ShiftType } from "../domain/shift";
import { nextSupplierTokens, suppliersMatchingTokens } from "../domain/trie";
import type { Role } from "@/modules/auth/domain/role";
import { formatArabicDate } from "@/shared/dates/business-date";
import {
  cachePosWorkspace,
  flushSupplierOutbox,
  persistSupplierClose,
  persistSupplierWorkspaceCommand,
  readCachedPosWorkspace,
  syncPersistedSupplierCommand,
  type SupplierEndpoint,
} from "@/shared/offline/supplier-offline";
import {
  createLocalShiftSnapshot,
  downloadLocalShiftSnapshot,
  invalidatePosVerifierIfVersionChanged,
} from "@/shared/offline/pos-close";

type TimelineEntry = PosBootstrap["entries"][number];
type CashRecord = PosBootstrap["cashRecords"][number];

const shiftLabels: Record<ShiftType, string> = { MORNING: "وردية صباحية", NIGHT: "وردية مسائية" };
const milkLabels: Record<MilkType, string> = { COW: "لبن بقري", BUFFALO: "لبن جاموسي" };
const cashAmounts = [10, 20, 50, 100];

const vintageNameButtonSx = {
  minHeight: { xs: 76, sm: 88 },
  border: "2px solid #8b6945",
  borderRadius: 1.25,
  color: "#3e2d1c",
  backgroundColor: "#fffaf0",
  boxShadow: "3px 3px 0 #dac19b",
  fontSize: { xs: "1.15rem", sm: "1.28rem" },
  fontWeight: 800,
  "&:hover": { backgroundColor: "#f8eedc", boxShadow: "1px 1px 0 #dac19b" },
};

function requestId() {
  return crypto.randomUUID();
}

async function json<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string };
}

function supplierMilkTypes(supplier: PosBootstrap["suppliers"][number] | null) {
  return supplier?.milkTypes?.length ? supplier.milkTypes : [...milkTypes];
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
  const [milkType, setMilkType] = useState<MilkType | null>(null);
  const [satls, setSatls] = useState(0);
  const [cups, setCups] = useState(0);
  const [quarters, setQuarters] = useState(0);
  const [cashParts, setCashParts] = useState<number[]>([]);
  const [cashOpen, setCashOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedSupplier =
    data?.suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const availableMilkTypes = supplierMilkTypes(selectedSupplier);
  const matchingSuppliers = useMemo(
    () => (data ? suppliersMatchingTokens(data.suppliers, prefix) : []),
    [data, prefix],
  );
  const nextTokens = useMemo(
    () => (data ? nextSupplierTokens(data.suppliers, prefix) : []),
    [data, prefix],
  );
  const quantityUnits = satls * 24 + cups * 4 + quarters;
  const cashPiasters = cashParts.reduce((total, amount) => total + amount * 100, 0);

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
      if (cached?.shift.businessDate !== businessDate || cached.shift.status !== "OPEN") return;
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

  function exitFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
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
          "افتح شاشة الاستلام مرة واحدة بالإنترنت لحفظ قائمة الموردين على هذا الجهاز.",
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

  function resetQuantity() {
    setSatls(0);
    setCups(0);
    setQuarters(0);
  }

  function selectSupplier(supplierId: string) {
    const supplier = data?.suppliers.find((candidate) => candidate.id === supplierId) ?? null;
    const types = supplierMilkTypes(supplier);
    setSelectedSupplierId(supplierId);
    setMilkType(types.length === 1 ? types[0] : null);
    setEditingEntry(null);
    resetQuantity();
    setPrefix([]);
  }

  function chooseToken(token: string) {
    if (!data) return;
    const nextPrefix = [...prefix, token];
    const matches = suppliersMatchingTokens(data.suppliers, nextPrefix);
    setPrefix(nextPrefix);
    if (matches.length === 1) selectSupplier(matches[0].id);
  }

  function finishSupplier() {
    setSelectedSupplierId(null);
    setMilkType(null);
    setPrefix([]);
    setEditingEntry(null);
    setCashParts([]);
    resetQuantity();
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

  function changeQuantity(units: number) {
    const nextUnits = Math.max(0, quantityUnits + units);
    setSatls(Math.floor(nextUnits / 24));
    setCups(Math.floor((nextUnits % 24) / 4));
    setQuarters(nextUnits % 4);
  }

  async function saveMilk() {
    if (!data || !selectedSupplier || !milkType || data.shift.status !== "OPEN" || !quantityUnits)
      return;
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
      resetQuantity();
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
    if (!data || !selectedSupplier || data.shift.status !== "OPEN" || cashPiasters <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const movementId = requestId();
      const localRecord: CashRecord = {
        id: movementId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.displayName,
        amountPiasters: cashPiasters,
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
          amountPiasters: cashPiasters,
        },
      });
      setData(localData);
      setCashParts([]);
      setCashOpen(false);
      const result = await syncPersistedSupplierCommand<{ movement: { id: string } }>(outboxEntry);
      if (result.status === "synced") await loadBootstrap(data.shift.id);
    } catch (caught) {
      setData(data);
      void cachePosWorkspace(data);
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل خصم النقد.");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!data || data.shift.status !== "OPEN") return;
    setBusy(true);
    setError(null);
    try {
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
      const localSnapshot = {
        id: `${data.shift.id}:${snapshot.checksum}`,
        shiftId: data.shift.id,
        snapshot,
        createdAt: new Date().toISOString(),
      };
      await persistSupplierClose(localData, localSnapshot, {
        id: requestId(),
        endpoint: `/api/supplier-shifts/${data.shift.id}/close`,
        method: "POST",
        payload: { commandId: requestId(), snapshot },
      });
      downloadLocalShiftSnapshot(localSnapshot);
      await flushSupplierOutbox();
      exitFullscreen();
      setData(null);
      finishSupplier();
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
        <Typography component="h1" variant="h2" sx={{ textAlign: "center" }}>
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
                sx={{ ...vintageNameButtonSx, minHeight: { xs: 176, sm: 216 } }}
              >
                {type === "MORNING" ? "صباحية" : "مسائية"}
              </Button>
            </Grid>
          ))}
        </Grid>
      </Stack>
    );
  }

  return (
    <Box component="section" sx={{ minHeight: "calc(100vh - 48px)", pb: 10 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Paper
        component="section"
        aria-label="اختيار المورد"
        sx={{ p: { xs: 1.5, sm: 2 }, minHeight: selectedSupplier ? "auto" : "calc(100vh - 70px)" }}
      >
        <Stack spacing={1.5}>
          <Button
            type="button"
            fullWidth
            disabled={!selectedSupplier || !milkType || !quantityUnits || busy}
            onClick={saveMilk}
            aria-label={
              selectedSupplier ? `تسجيل كمية ${selectedSupplier.displayName}` : "اسم المورد المختار"
            }
            sx={{
              minHeight: 82,
              border: "2px solid",
              borderColor: selectedSupplier ? "primary.main" : "divider",
              borderRadius: 1.25,
              color: "text.primary",
              fontSize: { xs: "1.45rem", sm: "1.7rem" },
              fontWeight: 800,
            }}
          >
            {selectedSupplier?.displayName ?? " "}
          </Button>

          {!selectedSupplier && (
            <>
              {data.suggestions.length > 0 && (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {data.suggestions.map((supplier) => (
                    <Button
                      key={supplier.id}
                      type="button"
                      size="small"
                      variant="outlined"
                      onClick={() => selectSupplier(supplier.id)}
                      sx={{ minHeight: 44 }}
                    >
                      {supplier.displayName}
                    </Button>
                  ))}
                </Stack>
              )}
              {prefix.length > 0 && (
                <Stack direction="row" sx={{ justifyContent: "flex-start" }}>
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
              <Grid container spacing={1.25}>
                {nextTokens.map((token) => (
                  <Grid key={token} size={{ xs: 6, sm: 4, md: 3 }}>
                    <Button
                      type="button"
                      fullWidth
                      onClick={() => chooseToken(token)}
                      sx={vintageNameButtonSx}
                    >
                      {token}
                    </Button>
                  </Grid>
                ))}
                {matchingSuppliers.length > 1 &&
                  nextTokens.length === 0 &&
                  matchingSuppliers.map((supplier) => (
                    <Grid key={supplier.id} size={{ xs: 6, sm: 4, md: 3 }}>
                      <Button
                        type="button"
                        fullWidth
                        onClick={() => selectSupplier(supplier.id)}
                        sx={vintageNameButtonSx}
                      >
                        {supplier.displayName}
                      </Button>
                    </Grid>
                  ))}
              </Grid>
            </>
          )}

          {selectedSupplier && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button type="button" size="small" onClick={finishSupplier}>
                  مورد آخر
                </Button>
                <Button
                  type="button"
                  size="small"
                  startIcon={<HistoryOutlinedIcon />}
                  onClick={() => setHistoryOpen(true)}
                >
                  آخر الحركات
                </Button>
              </Stack>
              {selectedSupplier.posInstruction && (
                <Typography color="text.secondary">{selectedSupplier.posInstruction}</Typography>
              )}
              {!milkType ? (
                <Grid container spacing={1.25}>
                  {availableMilkTypes.map((type) => (
                    <Grid key={type} size={{ xs: 6 }}>
                      <Button
                        type="button"
                        fullWidth
                        variant="outlined"
                        onClick={() => setMilkType(type)}
                        sx={{ ...vintageNameButtonSx, minHeight: 132 }}
                      >
                        {milkLabels[type]}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <>
                  <Typography align="center" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {milkLabels[milkType]}
                  </Typography>
                  <TapQuantity
                    satls={satls}
                    cups={cups}
                    quarters={quarters}
                    onAddSatl={() => changeQuantity(24)}
                    onRemoveSatl={() => changeQuantity(-24)}
                    onAddCup={() => changeQuantity(4)}
                    onRemoveCup={() => changeQuantity(-4)}
                    onAddQuarter={() => changeQuantity(1)}
                    onRemoveQuarter={() => changeQuantity(-1)}
                  />
                  {editingEntry && (
                    <Typography color="text.secondary" align="center">
                      اضغط الاسم لحفظ التعديل
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Fab
        color="secondary"
        aria-label="خصم نقد للمورد"
        disabled={!selectedSupplier || busy || data.shift.status !== "OPEN"}
        onClick={() => setCashOpen(true)}
        sx={{ position: "fixed", bottom: 22, left: 22 }}
      >
        <MoneyOffOutlinedIcon />
      </Fab>
      <Fab
        color="warning"
        aria-label="إنهاء الوردية"
        disabled={busy || data.shift.status !== "OPEN"}
        onClick={closeShift}
        sx={{ position: "fixed", bottom: 22, right: 22 }}
      >
        <CloseOutlinedIcon />
      </Fab>

      <Dialog open={cashOpen} onClose={() => !busy && setCashOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>خصم نقد — {selectedSupplier?.displayName}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Grid container spacing={1}>
              {cashAmounts.map((amount) => (
                <Grid key={amount} size={{ xs: 6 }}>
                  <Button
                    type="button"
                    fullWidth
                    variant="outlined"
                    disabled={busy}
                    onClick={() => setCashParts((parts) => [...parts, amount])}
                    sx={{ minHeight: 64, fontSize: "1.2rem" }}
                  >
                    {amount} ج
                  </Button>
                </Grid>
              ))}
            </Grid>
            <Button
              type="button"
              variant="text"
              disabled={cashParts.length === 0 || busy}
              onClick={() => setCashParts((parts) => parts.slice(0, -1))}
              sx={{ minHeight: 64, fontSize: "1.7rem", fontWeight: 800 }}
              aria-label="حذف آخر مبلغ مضاف"
            >
              {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(
                cashPiasters / 100,
              )}
            </Button>
            <Typography align="center" color="text.secondary">
              اضغط المبلغ لإضافة نقد، واضغط الرقم لإلغاء آخر مبلغ.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={busy} onClick={() => setCashOpen(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={busy || cashPiasters <= 0}
            onClick={saveCash}
          >
            خصم النقد
          </Button>
        </DialogActions>
      </Dialog>

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
                <Typography
                  key={movement.id}
                  sx={{ p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                >
                  {movement.supplierName} · خصم نقد
                </Typography>
              ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setHistoryOpen(false)}>
            إغلاق
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TapQuantity({
  satls,
  cups,
  quarters,
  onAddSatl,
  onRemoveSatl,
  onAddCup,
  onRemoveCup,
  onAddQuarter,
  onRemoveQuarter,
}: {
  satls: number;
  cups: number;
  quarters: number;
  onAddSatl: () => void;
  onRemoveSatl: () => void;
  onAddCup: () => void;
  onRemoveCup: () => void;
  onAddQuarter: () => void;
  onRemoveQuarter: () => void;
}) {
  const rows = [
    { label: "السطل", value: satls, onAdd: onAddSatl, onRemove: onRemoveSatl },
    { label: "الكوب", value: cups, onAdd: onAddCup, onRemove: onRemoveCup },
    { label: "الربع", value: quarters, onAdd: onAddQuarter, onRemove: onRemoveQuarter },
  ];
  return (
    <Stack spacing={1} aria-label="الكمية">
      {rows.map((row) => (
        <Stack key={row.label} direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
          <Button
            type="button"
            variant="outlined"
            onClick={row.onAdd}
            aria-label={`إضافة ${row.label}`}
            sx={{
              minWidth: { xs: 116, sm: 150 },
              minHeight: 66,
              fontSize: "1.2rem",
              fontWeight: 800,
            }}
          >
            {row.label}
          </Button>
          <Button
            type="button"
            variant="text"
            onClick={row.onRemove}
            aria-label={`إنقاص ${row.label}`}
            sx={{
              flexGrow: 1,
              minHeight: 66,
              fontSize: "2rem",
              fontWeight: 800,
              color: "text.primary",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.25,
            }}
          >
            {row.value}
          </Button>
        </Stack>
      ))}
      <Typography align="center" color="text.secondary">
        اضغط الاسم لإضافة الكمية، واضغط الرقم لإزالة واحد.
      </Typography>
    </Stack>
  );
}
