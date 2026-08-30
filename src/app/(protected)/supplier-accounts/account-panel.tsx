"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatPiasters } from "@/modules/suppliers/domain/money";
import type { Supplier, SupplierAccountMovement } from "@/modules/suppliers";
import type { MilkType } from "@/modules/suppliers/domain/shift";

type AccountSummary = {
  id: string;
  supplier: Supplier;
  milkType: MilkType;
  balancePiasters: number;
  unpricedMilkLines: number;
  pendingReviewCount: number;
};

type AccountDetail = {
  supplier: Supplier;
  milkType: MilkType;
  movements: SupplierAccountMovement[];
  balancePiasters: number;
  pricedMilkPiasters: number;
  unpricedMilkLines: number;
  instruction: {
    suggestedDeductionPiasters: number;
    holdPaymentUntil: string | null;
    note: string | null;
  } | null;
};

const milkLabels: Record<MilkType, string> = { COW: "لبن بقري", BUFFALO: "لبن جاموسي" };

function piasters(value: string, allowZero = false) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim().replace("٫", "."));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && (allowZero ? amount >= 0 : amount > 0) ? amount : null;
}

const movementLabels: Record<SupplierAccountMovement["type"], string> = {
  POS_CASH_OUT: "نقد مسجل من الاستلام",
  OWNER_CASH_OUT: "صرف نقدي من المالك",
  GOODS_CHARGE: "بضاعة للمورد",
  MANUAL_CREDIT: "إضافة رصيد",
  MANUAL_DEBIT: "خصم رصيد",
};

export function AccountPanel({
  accounts,
  pendingCash,
}: {
  accounts: AccountSummary[];
  pendingCash: SupplierAccountMovement[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(accounts[0]?.id ?? "");
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [amountEgp, setAmountEgp] = useState("");
  const [movementType, setMovementType] = useState<
    "OWNER_CASH_OUT" | "GOODS_CHARGE" | "MANUAL_CREDIT" | "MANUAL_DEBIT"
  >("OWNER_CASH_OUT");
  const [businessDate, setBusinessDate] = useState("");
  const [note, setNote] = useState("");
  const [suggestedEgp, setSuggestedEgp] = useState("");
  const [holdPaymentUntil, setHoldPaymentUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => accounts.find((account) => account.id === selectedId),
    [accounts, selectedId],
  );
  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, { supplier: Supplier; accounts: AccountSummary[] }>();
    for (const account of accounts) {
      const group = groups.get(account.supplier.id);
      if (group) group.accounts.push(account);
      else groups.set(account.supplier.id, { supplier: account.supplier, accounts: [account] });
    }
    return [...groups.values()];
  }, [accounts]);

  async function payload(response: Response) {
    return (await response.json()) as { error?: string };
  }

  async function loadAccount(account: AccountSummary) {
    setSelectedId(account.id);
    setError(null);
    setDetail(null);
    const response = await fetch(
      `/api/supplier-accounts/${account.supplier.id}?milkType=${account.milkType}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as AccountDetail & { error?: string };
    if (!response.ok) return setError(result.error ?? "تعذر تحميل الحساب.");
    setDetail(result);
    setSuggestedEgp(
      result.instruction ? String(result.instruction.suggestedDeductionPiasters / 100) : "",
    );
    setHoldPaymentUntil(result.instruction?.holdPaymentUntil ?? "");
    setNote(result.instruction?.note ?? "");
  }

  async function review(movementId: string) {
    setBusy(true);
    const response = await fetch("/api/supplier-accounts/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandId: crypto.randomUUID(), movementId }),
    });
    const result = await payload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر اعتماد الحركة.");
    router.refresh();
    if (selected) void loadAccount(selected);
  }

  async function addMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const amountPiasters = piasters(amountEgp);
    if (!amountPiasters) return setError("أدخل مبلغًا صحيحًا بالجنيه.");
    setBusy(true);
    setError(null);
    const response = await fetch("/api/supplier-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        movementId: crypto.randomUUID(),
        supplierId: selected.supplier.id,
        milkType: selected.milkType,
        type: movementType,
        amountPiasters,
        businessDate,
        note,
      }),
    });
    const result = await payload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر حفظ الحركة.");
    setAmountEgp("");
    setNote("");
    router.refresh();
    void loadAccount(selected);
  }

  async function saveInstruction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const suggestedDeductionPiasters = piasters(suggestedEgp, true);
    if (suggestedDeductionPiasters === null) return setError("أدخل مبلغ اقتراح صحيحًا.");
    setBusy(true);
    const response = await fetch("/api/supplier-accounts/instructions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        supplierId: selected.supplier.id,
        milkType: selected.milkType,
        suggestedDeductionPiasters,
        holdPaymentUntil: holdPaymentUntil || null,
        note,
      }),
    });
    const result = await payload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر حفظ التعليمات.");
    router.refresh();
    void loadAccount(selected);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          حسابات الموردين
        </Typography>
        <Typography color="text.secondary">
          هذا دفتر حقائق رئيسية: لا فوائد ولا خصومات تلقائية ولا رصيد قابل للتعديل.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={1.25}>
            <Typography component="h2" variant="h2">
              نقد الاستلام بانتظار المراجعة
            </Typography>
            {pendingCash.map((movement) => (
              <Stack key={movement.id} direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Typography sx={{ flexGrow: 1 }}>
                  {accounts.find(
                    (account) =>
                      account.supplier.id === movement.supplierId &&
                      account.milkType === movement.milkType,
                  )?.supplier.displayName ?? "مورد"}{" "}
                  · {milkLabels[movement.milkType]} · {formatPiasters(movement.amountPiasters)}
                </Typography>
                <Button type="button" disabled={busy} onClick={() => review(movement.id)}>
                  اعتماد
                </Button>
              </Stack>
            ))}
            {pendingCash.length === 0 && (
              <Typography color="text.secondary">لا توجد حركة نقد معلقة.</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Stack spacing={1} sx={{ minWidth: { lg: 320 }, flex: 1 }}>
          {groupedAccounts.map((group) => (
            <Stack
              key={group.supplier.id}
              spacing={0.5}
              sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}
            >
              <Typography sx={{ px: 0.5, fontWeight: 800 }}>
                {group.supplier.displayName}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.5}>
                {group.accounts.map((account) => (
                  <Button
                    key={account.id}
                    type="button"
                    variant={selectedId === account.id ? "contained" : "outlined"}
                    onClick={() => void loadAccount(account)}
                    sx={{ flex: 1, justifyContent: "space-between", minHeight: 52 }}
                  >
                    <span>{milkLabels[account.milkType]}</span>
                    <span>{formatPiasters(account.balancePiasters)}</span>
                  </Button>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
        <Stack spacing={2} sx={{ flex: 2 }}>
          {selected && (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography component="h2" variant="h2">
                    {selected.supplier.displayName} · {milkLabels[selected.milkType]}
                  </Typography>
                  {!detail && (
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={() => void loadAccount(selected)}
                    >
                      تحميل تفاصيل الحساب
                    </Button>
                  )}
                  {detail && (
                    <>
                      <Typography sx={{ fontWeight: 800 }}>
                        الرصيد المحسوب: {formatPiasters(detail.balancePiasters)}
                      </Typography>
                      <Typography color="text.secondary">
                        لبن مسعر: {formatPiasters(detail.pricedMilkPiasters)} · حركات غير مسعرة:{" "}
                        {detail.unpricedMilkLines}
                      </Typography>
                      <Divider />
                      <Stack spacing={0.75} sx={{ maxHeight: 260, overflowY: "auto" }}>
                        {detail.movements.map((movement) => (
                          <Typography key={movement.id}>
                            {movement.businessDate} · {movementLabels[movement.type]} ·{" "}
                            {formatPiasters(movement.amountPiasters)}
                            {movement.ownerReviewStatus === "PENDING" ? " · بانتظار المراجعة" : ""}
                          </Typography>
                        ))}
                        {detail.movements.length === 0 && (
                          <Typography color="text.secondary">لا توجد حركات بعد.</Typography>
                        )}
                      </Stack>
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}
          {selected && (
            <Card component="form" onSubmit={addMovement}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography component="h2" variant="h2">
                    إضافة حقيقة مالية
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      select
                      label="النوع"
                      value={movementType}
                      onChange={(event) =>
                        setMovementType(event.target.value as typeof movementType)
                      }
                    >
                      <MenuItem value="OWNER_CASH_OUT">صرف نقدي</MenuItem>
                      <MenuItem value="GOODS_CHARGE">بضاعة للمورد</MenuItem>
                      <MenuItem value="MANUAL_CREDIT">إضافة رصيد</MenuItem>
                      <MenuItem value="MANUAL_DEBIT">خصم رصيد</MenuItem>
                    </TextField>
                    <TextField
                      label="المبلغ بالجنيه"
                      value={amountEgp}
                      onChange={(event) => setAmountEgp(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                    <TextField
                      label="التاريخ"
                      type="date"
                      value={businessDate}
                      onChange={(event) => setBusinessDate(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                    />
                  </Stack>
                  <TextField
                    label="ملاحظة (اختياري)"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy}
                    sx={{ alignSelf: "start" }}
                  >
                    حفظ الحركة
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}
          {selected && (
            <Card component="form" onSubmit={saveInstruction}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography component="h2" variant="h2">
                    تعليمات سداد استشارية
                  </Typography>
                  <Typography color="text.secondary">
                    هذه تعليمات لاقتراح التسوية فقط؛ لا تمنع تسجيل النقد الفعلي ولا تنشئ حركة
                    تلقائية.
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      label="اقتراح خصم بالجنيه"
                      value={suggestedEgp}
                      onChange={(event) => setSuggestedEgp(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                    <TextField
                      label="إيقاف الدفع حتى (اختياري)"
                      type="date"
                      value={holdPaymentUntil}
                      onChange={(event) => setHoldPaymentUntil(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Stack>
                  <TextField
                    label="ملاحظة"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="outlined"
                    disabled={busy}
                    sx={{ alignSelf: "start" }}
                  >
                    حفظ التعليمات
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Stack>
      {accounts.length === 0 && <Chip label="أضف موردًا أولًا من شاشة الموردين." />}
    </Stack>
  );
}
