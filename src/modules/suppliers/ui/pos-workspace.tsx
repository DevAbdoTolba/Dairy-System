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
import IconButton from "@mui/material/IconButton";
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
const cashAmounts = [5, 10, 20, 50, 100, 200] as const;

function emptyCashCounts(): Record<(typeof cashAmounts)[number], number> {
  return { 5: 0, 10: 0, 20: 0, 50: 0, 100: 0, 200: 0 };
}

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

function cairoClock() {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(new Date());
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
  const [cashCounts, setCashCounts] =
    useState<Record<(typeof cashAmounts)[number], number>>(emptyCashCounts);
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
  const cashPiasters = cashAmounts.reduce(
    (total, amount) => total + amount * cashCounts[amount] * 100,
    0,
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

  useEffect(() => {
    const leaveShiftWorkspace = () => {
      setData(null);
      setError(null);
      setSelectedSupplierId(null);
      setMilkType(null);
      setPrefix([]);
      setEditingEntry(null);
      setCashCounts(emptyCashCounts());
      setSatls(0);
      setCups(0);
      setQuarters(0);
    };
    window.addEventListener("dairy-pos-leave-shift", leaveShiftWorkspace);
    return () => window.removeEventListener("dairy-pos-leave-shift", leaveShiftWorkspace);
  }, []);

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
    setCashCounts(emptyCashCounts());
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
    if (units === 24) setSatls((value) => value + 1);
    if (units === -24) setSatls((value) => Math.max(0, value - 1));
    if (units === 4) {
      setCups((value) => {
        if (value < 5) return value + 1;
        setSatls((satl) => satl + 1);
        return 0;
      });
    }
    if (units === -4) setCups((value) => Math.max(0, value - 1));
    if (units === 1) {
      setQuarters((value) => {
        if (value < 3) return value + 1;
        setCups((cup) => {
          if (cup < 5) return cup + 1;
          setSatls((satl) => satl + 1);
          return 0;
        });
        return 0;
      });
    }
    if (units === -1) setQuarters((value) => Math.max(0, value - 1));
  }

  async function saveMilk() {
    if (!data) return;
    if (!selectedSupplier) {
      setError("اختاري المورد أولاً.");
      return;
    }
    if (data.shift.status !== "OPEN") {
      setError("الوردية مغلقة.");
      return;
    }
    if (busy) return;
    if (!milkType) {
      setError("اختاري نوع اللبن أولاً.");
      return;
    }
    if (!quantityUnits) {
      setError("اختاري كمية أولاً.");
      return;
    }
    setBusy(true);
    setError(null);
    let savedLocally = false;
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
      savedLocally = true;
      setData(localData);
      finishSupplier();
      void syncPersistedSupplierCommand<{ entry: TimelineEntry }>(outboxEntry)
        .then((result) => {
          if (result.status === "synced") void loadBootstrap(data.shift.id).catch(() => undefined);
        })
        .catch((error) => {
          setError(error instanceof Error ? error.message : "تعذر مزامنة اللبن.");
        });
    } catch (caught) {
      if (!savedLocally) {
        setData(data);
        void cachePosWorkspace(data);
      }
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
    if (
      !data ||
      !selectedSupplier ||
      !milkType ||
      data.shift.status !== "OPEN" ||
      cashPiasters <= 0
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const movementId = requestId();
      const localRecord: CashRecord = {
        id: movementId,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.displayName,
        milkType,
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
          milkType,
          amountPiasters: cashPiasters,
        },
      });
      setData(localData);
      setCashCounts(emptyCashCounts());
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
    <Box component="section" sx={{ minHeight: "calc(100dvh - 48px)", pb: 10 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Paper
        component="section"
        aria-label="اختيار المورد"
        sx={{
          p: selectedSupplier ? { xs: 0.5, sm: 1 } : { xs: 1.5, sm: 2 },
          minHeight: "calc(100dvh - 70px)",
        }}
      >
        <Stack
          spacing={1.5}
          sx={{ minHeight: selectedSupplier ? "calc(100dvh - 86px)" : undefined }}
        >
          <Box sx={{ position: "relative" }}>
            <Box
              component="button"
              type="button"
              onClick={() => void saveMilk()}
              aria-disabled={!selectedSupplier || busy || data.shift.status !== "OPEN"}
              aria-label={
                selectedSupplier ? `تسجيل كمية ${selectedSupplier.displayName}` : "المورد المختار"
              }
              sx={{
                display: "block",
                width: "100%",
                minHeight: { xs: 78, sm: "clamp(88px, 10vw, 140px)" },
                border: "2px solid",
                borderColor: selectedSupplier ? "primary.main" : "divider",
                borderRadius: 1.25,
                color: "text.primary",
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
            >
              <Typography
                component="span"
                align="center"
                sx={{
                  display: "block",
                  px: { xs: 6, sm: 8 },
                  py: 1,
                  fontSize: "clamp(1.7rem, 4.4vw, 4rem)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                {selectedSupplier?.displayName ?? (prefix.length ? prefix.join(" ") : " ")}
              </Typography>
            </Box>
            <IconButton
              type="button"
              aria-label={selectedSupplier ? "آخر الحركات" : "إعادة اختيار الاسم"}
              disabled={!selectedSupplier && prefix.length === 0}
              onClick={() => {
                if (selectedSupplier) setHistoryOpen(true);
                else setPrefix([]);
              }}
              sx={{
                position: "absolute",
                top: 5,
                left: 5,
                minWidth: 44,
                minHeight: 44,
                border: "2px solid #8b6945",
                color: "#3e2d1c",
                backgroundColor: "#fffaf0",
                visibility: selectedSupplier || prefix.length ? "visible" : "hidden",
              }}
            >
              {selectedSupplier ? <HistoryOutlinedIcon /> : <ReplayOutlinedIcon />}
            </IconButton>
            {selectedSupplier && (
              <IconButton
                type="button"
                aria-label="إلغاء المورد"
                onClick={finishSupplier}
                sx={{
                  position: "absolute",
                  top: 5,
                  right: 5,
                  minWidth: 44,
                  minHeight: 44,
                  border: "2px solid #8b6945",
                  color: "#3e2d1c",
                  backgroundColor: "#fffaf0",
                }}
              >
                <CloseOutlinedIcon />
              </IconButton>
            )}
          </Box>

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
            <Stack spacing={1.5} sx={{ flexGrow: 1, justifyContent: "center", pb: "8vh" }}>
              {selectedSupplier.posInstruction && (
                <Typography color="text.secondary">{selectedSupplier.posInstruction}</Typography>
              )}
              {!milkType ? (
                <Stack spacing={1} sx={{ alignItems: "center", pt: 2 }}>
                  <Typography color="text.secondary" sx={{ fontWeight: 700 }}>
                    اختاري نوع اللبن
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {availableMilkTypes.map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant="outlined"
                        onClick={() => setMilkType(type)}
                        sx={{ minWidth: { xs: 118, sm: 156 }, minHeight: 62, fontWeight: 800 }}
                      >
                        {milkLabels[type]}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
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
                      اضغط الاسم لتسجيل التعديل
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
        disabled={!selectedSupplier || !milkType || busy || data.shift.status !== "OPEN"}
        onClick={() => setCashOpen(true)}
        sx={{ position: "fixed", bottom: 22, right: 22 }}
      >
        <MoneyOffOutlinedIcon />
      </Fab>
      <Fab
        color="warning"
        aria-label="إنهاء الوردية"
        disabled={busy || data.shift.status !== "OPEN"}
        onClick={closeShift}
        sx={{ position: "fixed", bottom: 22, left: 22 }}
      >
        <CloseOutlinedIcon />
      </Fab>

      <Dialog open={cashOpen} onClose={() => !busy && setCashOpen(false)} fullScreen>
        <Box component="section" sx={{ minHeight: "100vh", p: { xs: 1.5, sm: 2 }, pb: 10 }}>
          <Stack spacing={1.25} sx={{ maxWidth: 760, mx: "auto" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box
                component="button"
                type="button"
                disabled={busy || !milkType || cashPiasters <= 0}
                onClick={saveCash}
                aria-label="حفظ خصم النقد"
                sx={{
                  flexGrow: 1,
                  border: 2,
                  borderStyle: "solid",
                  borderColor: "text.primary",
                  borderRadius: 1,
                  backgroundColor: "transparent",
                  cursor: milkType && cashPiasters > 0 ? "pointer" : "default",
                  "&:disabled": { color: "text.primary", opacity: 1 },
                }}
              >
                <Typography component="h2" variant="h2" align="center">
                  {selectedSupplier?.displayName}
                </Typography>
                {milkType && (
                  <Typography align="center" variant="body2" sx={{ pb: 0.75 }}>
                    {milkLabels[milkType]}
                  </Typography>
                )}
              </Box>
              <Typography component="time" aria-label="الوقت الحالي" sx={{ fontWeight: 800 }}>
                {cairoClock()}
              </Typography>
            </Stack>
            {selectedSupplier?.posInstruction && (
              <Paper variant="outlined" sx={{ p: 0.75 }}>
                <Typography align="center">{selectedSupplier.posInstruction}</Typography>
              </Paper>
            )}
            <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ pt: 1 }}>
              {cashAmounts.map((amount) => (
                <Grid key={amount} size={{ xs: 4 }}>
                  <Stack spacing={0.5} sx={{ alignItems: "center" }}>
                    <Button
                      type="button"
                      variant="outlined"
                      disabled={busy}
                      onClick={() =>
                        setCashCounts((counts) => ({ ...counts, [amount]: counts[amount] + 1 }))
                      }
                      sx={{
                        width: "100%",
                        maxWidth: 166,
                        minWidth: 0,
                        aspectRatio: "1",
                        borderRadius: "50%",
                        fontSize: { xs: "1.35rem", sm: "1.7rem" },
                        fontWeight: 800,
                      }}
                    >
                      {amount}
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      disabled={busy || cashCounts[amount] === 0}
                      onClick={() =>
                        setCashCounts((counts) => ({
                          ...counts,
                          [amount]: Math.max(0, counts[amount] - 1),
                        }))
                      }
                      aria-label={`إنقاص عدد فئة ${amount} جنيه`}
                      sx={{ minHeight: 36, minWidth: 44, fontSize: "1.25rem", fontWeight: 800 }}
                    >
                      {cashCounts[amount]}
                    </Button>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Stack>
          <Fab
            aria-label="العودة إلى اللبن"
            disabled={busy}
            onClick={() => {
              setCashCounts(emptyCashCounts());
              setCashOpen(false);
            }}
            sx={{ position: "fixed", bottom: 22, right: 22 }}
          >
            ←
          </Fab>
        </Box>
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
                  {movement.supplierName} · {milkLabels[movement.milkType]} · خصم نقد
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
    <Stack
      direction="row"
      spacing={{ xs: 1.25, sm: 2.5 }}
      aria-label="الكمية"
      sx={{
        width: "100%",
        justifyContent: "center",
        alignItems: "flex-start",
        pt: "clamp(8px, 3vh, 32px)",
      }}
    >
      {rows.map((row) => (
        <Stack
          key={row.label}
          sx={{ width: "min(29vw, 350px)", flex: "0 1 29vw", alignItems: "center" }}
        >
          <Button
            type="button"
            variant="outlined"
            onClick={row.onAdd}
            aria-label={`إضافة ${row.label}`}
            sx={{
              width: "100%",
              minWidth: 0,
              aspectRatio: "1",
              fontSize: "clamp(1.1rem, 2.5vw, 2.2rem)",
              fontWeight: 800,
              borderWidth: 3,
              borderColor: "text.primary",
              borderRadius: 1.25,
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
              mt: "clamp(20px, 4vh, 52px)",
              minHeight: "clamp(44px, 5vw, 64px)",
              minWidth: "clamp(44px, 5vw, 64px)",
              fontSize: "clamp(1.65rem, 3vw, 2.6rem)",
              fontWeight: 800,
              color: "text.primary",
            }}
          >
            {row.value}
          </Button>
        </Stack>
      ))}
    </Stack>
  );
}
