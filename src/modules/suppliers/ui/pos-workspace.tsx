"use client";

import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
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
type HistoryItem =
  | { kind: "milk"; createdAt: string; entry: TimelineEntry }
  | { kind: "cash"; createdAt: string; record: CashRecord };

const shiftLabels: Record<ShiftType, string> = { MORNING: "وردية صباحية", NIGHT: "وردية مسائية" };
const milkLabels: Record<MilkType, string> = { COW: "لبن بقري", BUFFALO: "لبن جاموسي" };
const cashRecommendations = [50, 100, 200] as const;
const cashKeypad = ["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const;
type CashInputAction =
  | { kind: "RECOMMENDATION"; amountEgp: number }
  | { kind: "DIGIT"; digit: string }
  | { kind: "BACKSPACE" };

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

const vintageHeaderActionSx = {
  position: "absolute",
  top: 0,
  width: "8vmin",
  minWidth: 0,
  height: "100%",
  minHeight: 0,
  border: "2px solid #8b6945",
  borderRadius: 1.25,
  color: "#3e2d1c",
  backgroundColor: "#fffaf0",
  boxShadow: "3px 3px 0 #dac19b",
  "&:hover": { backgroundColor: "#f8eedc", boxShadow: "1px 1px 0 #dac19b" },
};

const staticHeaderNameSize = "5vmin";
const staticHeaderIconSize = "3.8vmin";
const staticCounterSize = "5vmin";

function requestId() {
  return crypto.randomUUID();
}

async function json<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string };
}

function supplierMilkTypes(supplier: PosBootstrap["suppliers"][number] | null) {
  return supplier?.milkTypes?.length ? supplier.milkTypes : [...milkTypes];
}

function formatHistoryTime(timestamp: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(new Date(timestamp));
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
  const [cashAmountEgp, setCashAmountEgp] = useState("");
  const [cashInputActions, setCashInputActions] = useState<CashInputAction[]>([]);
  const [cashOpen, setCashOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<"supplier" | "shift" | null>(null);

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
  const cashPiasters = cashAmountEgp ? Number(cashAmountEgp) * 100 : 0;
  const historyItems = useMemo<HistoryItem[]>(() => {
    if (!data || !historyScope) return [];
    const supplierId = historyScope === "supplier" ? selectedSupplierId : null;
    const belongsToScope = (record: { supplierId: string }) =>
      !supplierId || record.supplierId === supplierId;
    return [
      ...data.entries
        .filter((entry) => !entry.deletedAt && belongsToScope(entry))
        .map((entry) => ({ kind: "milk" as const, createdAt: entry.createdAt, entry })),
      ...data.cashRecords
        .filter(belongsToScope)
        .map((record) => ({ kind: "cash" as const, createdAt: record.createdAt, record })),
    ].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [data, historyScope, selectedSupplierId]);

  const loadBootstrap = useCallback(
    async (shiftId: string) => {
      const response = await fetch(`/api/pos/bootstrap?shiftId=${encodeURIComponent(shiftId)}`, {
        cache: "no-store",
      });
      const result = await json<PosBootstrap>(response);
      if (!response.ok) throw new Error(result.error ?? "تعذر تحميل بيانات الوردية.");
      if (result.posCredentialVersion)
        await invalidatePosVerifierIfVersionChanged(result.posCredentialVersion, credentialRole);
      if (result.shift.status !== "OPEN") {
        setData(null);
        setError(null);
        return;
      }
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
      setCashAmountEgp("");
      setCashInputActions([]);
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

  function resetCashInput() {
    setCashAmountEgp("");
    setCashInputActions([]);
  }

  function chooseCashRecommendation(amountEgp: number) {
    setCashAmountEgp(String(amountEgp));
    setCashInputActions((actions) => [...actions, { kind: "RECOMMENDATION", amountEgp }]);
  }

  function appendCashDigit(digit: string) {
    const nextAmount = cashAmountEgp === "0" ? digit : `${cashAmountEgp}${digit}`;
    if (nextAmount.length > 7 || Number(nextAmount) > 1_000_000) return;
    setCashAmountEgp(nextAmount);
    setCashInputActions((actions) => [...actions, { kind: "DIGIT", digit }]);
  }

  function backspaceCashAmount() {
    if (!cashAmountEgp) return;
    setCashAmountEgp(cashAmountEgp.slice(0, -1));
    setCashInputActions((actions) => [...actions, { kind: "BACKSPACE" }]);
  }

  function closeCashInput() {
    const actions = cashInputActions;
    const shiftId = data?.shift.id;
    const supplierId = selectedSupplier?.id;
    const selectedMilkType = milkType;
    resetCashInput();
    setCashOpen(false);
    if (!shiftId || !supplierId || !selectedMilkType || actions.length === 0 || !navigator.onLine)
      return;
    void fetch(`/api/supplier-shifts/${encodeURIComponent(shiftId)}/cash-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: requestId(),
        supplierId,
        milkType: selectedMilkType,
        inputActions: actions,
      }),
    });
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
    resetCashInput();
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
      setData(null);
      setError(null);
      finishSupplier();
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
          inputActions: cashInputActions,
        },
      });
      setData(localData);
      resetCashInput();
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
    <Box
      component="section"
      sx={{
        minHeight: "calc(100dvh - 5vmin)",
        height: selectedSupplier ? "calc(100dvh - 5vmin)" : undefined,
        pb: selectedSupplier ? 0 : 10,
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Paper
        component="section"
        aria-label="اختيار المورد"
        sx={{
          p: selectedSupplier ? "1vmin" : { xs: 1.5, sm: 2 },
          minHeight: "calc(100dvh - 5vmin)",
          height: selectedSupplier ? "100%" : undefined,
          overflow: selectedSupplier ? "hidden" : undefined,
        }}
      >
        <Stack
          spacing={0}
          sx={{
            minHeight: selectedSupplier ? "calc(100dvh - 5vmin)" : undefined,
            height: selectedSupplier ? "100%" : undefined,
            gap: selectedSupplier ? "1vmin" : "2.5vmin",
          }}
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
                height: "10vmin",
                minHeight: 0,
                border: "2px solid",
                borderColor: editingEntry
                  ? "#a85420"
                  : selectedSupplier
                    ? "primary.main"
                    : "divider",
                borderRadius: 1.25,
                color: "text.primary",
                backgroundColor: editingEntry ? "#fff0df" : "transparent",
                boxShadow: editingEntry ? "4px 4px 0 #e8b078" : undefined,
                cursor: "pointer",
              }}
            >
              <Typography
                component="span"
                align="center"
                sx={{
                  display: "block",
                  px: "10vmin",
                  py: "1vmin",
                  fontSize: staticHeaderNameSize,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selectedSupplier?.displayName ?? (prefix.length ? prefix.join(" ") : " ")}
              </Typography>
            </Box>
            {selectedSupplier && (
              <Button
                type="button"
                aria-label="العودة لاختيار المورد"
                onClick={finishSupplier}
                sx={{ ...vintageHeaderActionSx, left: 0 }}
              >
                <ReplayOutlinedIcon sx={{ fontSize: staticHeaderIconSize }} />
              </Button>
            )}
            {!selectedSupplier && prefix.length > 0 && (
              <Button
                type="button"
                aria-label="إعادة اختيار الاسم"
                onClick={() => setPrefix([])}
                sx={{ ...vintageHeaderActionSx, left: 0 }}
              >
                <ReplayOutlinedIcon sx={{ fontSize: staticHeaderIconSize }} />
              </Button>
            )}
            <Button
              type="button"
              aria-label={selectedSupplier ? "سجل هذا المورد" : "سجل الوردية"}
              onClick={() => setHistoryScope(selectedSupplier ? "supplier" : "shift")}
              sx={{ ...vintageHeaderActionSx, right: 0 }}
            >
              <HistoryOutlinedIcon sx={{ fontSize: staticHeaderIconSize }} />
            </Button>
          </Box>

          {!selectedSupplier && (
            <>
              {data.suggestions.length > 0 && (
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{
                    overflowX: "auto",
                    overflowY: "hidden",
                    flexWrap: "nowrap",
                    px: "0.5vmin",
                    pb: "0.5vmin",
                    scrollbarWidth: "thin",
                  }}
                >
                  {data.suggestions.map((supplier) => (
                    <Button
                      key={supplier.id}
                      type="button"
                      size="small"
                      variant="outlined"
                      onClick={() => selectSupplier(supplier.id)}
                      sx={{ minHeight: 44, flex: "0 0 auto" }}
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
            <Stack
              spacing={1.5}
              sx={{
                flexGrow: 1,
                minHeight: 0,
                justifyContent: "center",
                pb: "8vmin",
              }}
            >
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
                    editing={Boolean(editingEntry)}
                  />
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
        sx={{ position: "fixed", bottom: "2vmin", right: "2vmin", width: "6vmin", height: "6vmin" }}
      >
        <MoneyOffOutlinedIcon />
      </Fab>
      <Fab
        color="warning"
        aria-label="إنهاء الوردية"
        disabled={busy || data.shift.status !== "OPEN"}
        onClick={closeShift}
        sx={{ position: "fixed", bottom: "2vmin", left: "2vmin", width: "6vmin", height: "6vmin" }}
      >
        <CloseOutlinedIcon />
      </Fab>

      <Dialog open={cashOpen} onClose={() => !busy && closeCashInput()} fullScreen>
        <Box component="section" sx={{ height: "100dvh", p: "2vmin", overflow: "hidden" }}>
          <Stack spacing={0} sx={{ height: "calc(100dvh - 4vmin)", gap: "2vmin" }}>
            <Box sx={{ position: "relative" }}>
              <Box
                component="button"
                type="button"
                disabled={busy || !milkType || cashPiasters <= 0}
                onClick={saveCash}
                aria-label="حفظ خصم النقد"
                sx={{
                  display: "block",
                  width: "100%",
                  height: "12vmin",
                  minHeight: 0,
                  border: "2px solid",
                  borderColor: "primary.main",
                  borderRadius: 1.25,
                  color: "text.primary",
                  backgroundColor: "transparent",
                  cursor: milkType && cashPiasters > 0 ? "pointer" : "default",
                  "&:disabled": { color: "text.primary", opacity: 1 },
                }}
              >
                <Typography
                  component="span"
                  align="center"
                  sx={{
                    display: "block",
                    px: "10vmin",
                    pt: "1.25vmin",
                    fontSize: "4vmin",
                    fontWeight: 800,
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedSupplier?.displayName}
                </Typography>
                {milkType && (
                  <Typography align="center" sx={{ fontSize: "2.2vmin", fontWeight: 700 }}>
                    {milkLabels[milkType]}
                  </Typography>
                )}
              </Box>
              <Button
                type="button"
                aria-label="العودة إلى وزن المورد"
                disabled={busy}
                onClick={closeCashInput}
                sx={{ ...vintageHeaderActionSx, left: 0 }}
              >
                <ReplayOutlinedIcon sx={{ fontSize: staticHeaderIconSize }} />
              </Button>
            </Box>
            {selectedSupplier?.posInstruction && (
              <Paper variant="outlined" sx={{ p: 0.75 }}>
                <Typography align="center">{selectedSupplier.posInstruction}</Typography>
              </Paper>
            )}
            <Stack
              sx={{
                flexGrow: 1,
                minHeight: 0,
                alignItems: "center",
                justifyContent: "space-evenly",
              }}
            >
              <Stack direction="row" spacing={1}>
                {cashRecommendations.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => chooseCashRecommendation(amount)}
                    sx={{
                      minWidth: "10vmin",
                      minHeight: "6vmin",
                      borderRadius: 99,
                      fontSize: "2.2vmin",
                    }}
                  >
                    {amount}
                  </Button>
                ))}
              </Stack>
              <Box
                component="output"
                aria-label="المبلغ النقدي بالجنيه"
                dir="ltr"
                sx={{
                  width: "min(100%, 42vmin)",
                  minHeight: "9vmin",
                  borderBottom: "2px solid",
                  borderColor: "text.primary",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "5vmin",
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {cashAmountEgp || "0"}
              </Box>
              <Box
                dir="ltr"
                sx={{
                  width: "min(100%, 42vmin)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "1vmin",
                }}
              >
                {cashKeypad.map((digit) => (
                  <Button
                    key={digit}
                    type="button"
                    variant="text"
                    disabled={busy}
                    onClick={() => appendCashDigit(digit)}
                    sx={{
                      minHeight: "7vmin",
                      fontSize: "3vmin",
                      fontWeight: 800,
                      color: "text.primary",
                    }}
                  >
                    {digit}
                  </Button>
                ))}
                <Box aria-hidden="true" />
                <Button
                  type="button"
                  variant="text"
                  disabled={busy}
                  onClick={() => appendCashDigit("0")}
                  sx={{
                    minHeight: "7vmin",
                    fontSize: "3vmin",
                    fontWeight: 800,
                    color: "text.primary",
                  }}
                >
                  0
                </Button>
                <Button
                  type="button"
                  variant="text"
                  disabled={busy}
                  onClick={backspaceCashAmount}
                  aria-label="حذف آخر رقم"
                  sx={{
                    minHeight: "7vmin",
                    fontSize: "3vmin",
                    fontWeight: 800,
                    color: "text.primary",
                  }}
                >
                  ←
                </Button>
              </Box>
            </Stack>
          </Stack>
        </Box>
      </Dialog>

      <Dialog
        open={historyScope !== null}
        onClose={() => !busy && setHistoryScope(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{historyScope === "supplier" ? "سجل المورد" : "سجل الوردية"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {historyItems.map((item) =>
              item.kind === "milk" ? (
                <Button
                  key={item.entry.id}
                  type="button"
                  fullWidth
                  disabled={busy || data.shift.status !== "OPEN"}
                  onClick={() => {
                    setHistoryScope(null);
                    startEdit(item.entry);
                  }}
                  sx={{
                    justifyContent: "stretch",
                    minHeight: 72,
                    border: "2px solid #8b6945",
                    borderRadius: 1.25,
                    color: "#3e2d1c",
                    backgroundColor: "#fffaf0",
                    boxShadow: "2px 2px 0 #dac19b",
                    textAlign: "start",
                    "&:hover": { backgroundColor: "#f8eedc", boxShadow: "1px 1px 0 #dac19b" },
                  }}
                >
                  <Stack spacing={0.25} sx={{ width: "100%" }}>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.05rem" }}>
                      {historyScope === "supplier"
                        ? formatQuantityArabic(item.entry.quantityQuarterCupUnits)
                        : item.entry.supplierName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {historyScope === "supplier"
                        ? item.entry.supplierName
                        : formatQuantityArabic(item.entry.quantityQuarterCupUnits)}
                      {" · "}
                      {milkLabels[item.entry.milkType]}
                      {" · "}
                      {formatHistoryTime(item.createdAt)}
                    </Typography>
                  </Stack>
                </Button>
              ) : (
                <Paper
                  key={item.record.id}
                  variant="outlined"
                  sx={{
                    border: "2px solid #d3c6b5",
                    borderRadius: 1.25,
                    bgcolor: "#fffdf9",
                    p: 1.25,
                  }}
                >
                  <Typography sx={{ fontWeight: 800 }}>
                    {historyScope === "supplier" ? "خصم نقد" : item.record.supplierName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {historyScope === "supplier" ? item.record.supplierName : "خصم نقد"}
                    {" · "}
                    {milkLabels[item.record.milkType]}
                    {" · "}
                    {((item.record.amountPiasters ?? 0) / 100).toLocaleString("ar-EG")} ج{" · "}
                    {formatHistoryTime(item.createdAt)}
                  </Typography>
                </Paper>
              ),
            )}
            {historyItems.length === 0 && (
              <Typography color="text.secondary">
                {historyScope === "supplier"
                  ? "لا توجد حركة لهذا المورد في هذه الوردية بعد."
                  : "لا توجد حركة في هذه الوردية بعد."}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setHistoryScope(null)}>
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
  editing,
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
  editing: boolean;
}) {
  const rows = [
    { label: "السطل", value: satls, onAdd: onAddSatl, onRemove: onRemoveSatl },
    { label: "الكوب", value: cups, onAdd: onAddCup, onRemove: onRemoveCup },
    { label: "الربع", value: quarters, onAdd: onAddQuarter, onRemove: onRemoveQuarter },
  ];
  return (
    <Stack
      direction="row"
      spacing={0}
      aria-label="الكمية"
      sx={{
        width: "100%",
        flexGrow: 1,
        minHeight: 0,
        alignItems: "stretch",
        gap: "2vmin",
        pt: "1vmin",
      }}
    >
      {rows.map((row) => (
        <Stack
          key={row.label}
          sx={{ flex: "1 1 0", minWidth: 0, minHeight: 0, alignItems: "center" }}
        >
          <Box
            sx={{
              flexGrow: 1,
              minHeight: 0,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Button
              type="button"
              variant="outlined"
              onClick={row.onAdd}
              aria-label={`إضافة ${row.label}`}
              sx={{
                width: "auto",
                height: "100%",
                maxWidth: "100%",
                maxHeight: "30vmin",
                minWidth: 0,
                aspectRatio: "1",
                fontSize: "2.8vmin",
                fontWeight: 800,
                borderWidth: 3,
                borderColor: editing ? "#a85420" : "text.primary",
                borderRadius: 1.25,
                backgroundColor: editing ? "#fff0df" : "transparent",
              }}
            >
              {row.label}
            </Button>
          </Box>
          <Button
            type="button"
            variant="text"
            onClick={row.onRemove}
            aria-label={`إنقاص ${row.label}`}
            sx={{
              mt: "1vmin",
              minHeight: staticCounterSize,
              minWidth: staticCounterSize,
              fontSize: "3.6vmin",
              fontWeight: 800,
              color: editing ? "#a85420" : "text.primary",
            }}
          >
            {row.value}
          </Button>
        </Stack>
      ))}
    </Stack>
  );
}
