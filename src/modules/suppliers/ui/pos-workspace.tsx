"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import type { PosBootstrap } from "../application/pos-service";
import {
  quantityFromParts,
  quantityPartsFromUnits,
  formatQuantityArabic,
} from "../domain/quantity";
import { nextSupplierTokens, suppliersMatchingTokens } from "../domain/trie";
import type { MilkType, ShiftType } from "../domain/shift";
import { formatArabicDate } from "@/shared/dates/business-date";

type TimelineEntry = PosBootstrap["entries"][number];

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

export function PosWorkspace({ businessDate }: { businessDate: string }) {
  const [data, setData] = useState<PosBootstrap | null>(null);
  const [selectedShiftType, setSelectedShiftType] = useState<ShiftType>("MORNING");
  const [prefix, setPrefix] = useState<string[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [milkType, setMilkType] = useState<MilkType>("COW");
  const [satls, setSatls] = useState(0);
  const [cups, setCups] = useState(0);
  const [quarters, setQuarters] = useState(0);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function loadBootstrap(shiftId: string) {
    const response = await fetch(`/api/pos/bootstrap?shiftId=${encodeURIComponent(shiftId)}`, {
      cache: "no-store",
    });
    const result = await json<PosBootstrap>(response);
    if (!response.ok) throw new Error(result.error ?? "تعذر تحميل بيانات الوردية.");
    setData(result);
  }

  async function openShift() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/supplier-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandId: requestId(), businessDate, type: selectedShiftType }),
      });
      const result = await json<{ shift: { id: string } }>(response);
      if (!response.ok) throw new Error(result.error ?? "تعذر فتح الوردية.");
      await loadBootstrap(result.shift.id);
      setMessage("تم فتح الوردية.");
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
    if (!data || !selectedSupplier) return;
    setBusy(true);
    setError(null);
    try {
      const quantityQuarterCupUnits = quantityFromParts({ satls, cups, quarters });
      const url = editingEntry
        ? `/api/supplier-shifts/${data.shift.id}/milk/${editingEntry.id}`
        : `/api/supplier-shifts/${data.shift.id}/milk`;
      const response = await fetch(url, {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingEntry
            ? {
                commandId: requestId(),
                expectedRevision: editingEntry.revision,
                quantityQuarterCupUnits,
              }
            : {
                commandId: requestId(),
                supplierId: selectedSupplier.id,
                milkType,
                quantityQuarterCupUnits,
              },
        ),
      });
      const result = await json<{ entry: TimelineEntry }>(response);
      if (!response.ok) throw new Error(result.error ?? "تعذر حفظ اللبن.");
      setEditingEntry(null);
      setSatls(0);
      setCups(0);
      setQuarters(0);
      setMessage(editingEntry ? "تم تعديل الحركة." : "تم حفظ اللبن.");
      await loadBootstrap(data.shift.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ اللبن.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry: TimelineEntry) {
    if (!data || entry.deletedAt || !window.confirm("حذف هذه الحركة من الوردية المفتوحة؟")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/supplier-shifts/${data.shift.id}/milk/${entry.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandId: requestId(), expectedRevision: entry.revision }),
      });
      const result = await json<{ entry: TimelineEntry }>(response);
      if (!response.ok) throw new Error(result.error ?? "تعذر حذف الحركة.");
      setMessage("تم حذف الحركة من الوردية المفتوحة.");
      await loadBootstrap(data.shift.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف الحركة.");
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
          <Chip color="success" label="متصل" />
          <Chip
            variant="outlined"
            label={data.shift.status === "OPEN" ? "وردية مفتوحة" : "وردية مغلقة"}
          />
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
                  disabled={busy || satls + cups + quarters === 0}
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
                    disabled={busy}
                    onClick={() => startEdit(entry)}
                  >
                    تعديل
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    disabled={busy}
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
        </Stack>
      </Paper>
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
