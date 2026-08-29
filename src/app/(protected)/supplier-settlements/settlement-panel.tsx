"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPiasters } from "@/modules/suppliers/domain/money";
import type { Supplier, SupplierSettlement } from "@/modules/suppliers";

type SettlementPreview = Omit<SupplierSettlement, "id" | "createdAt" | "paymentMovementId"> & {
  entryIds: string[];
  movementIds: string[];
};

function piasters(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim().replace("٫", "."));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function SettlementPanel({
  suppliers,
  settlements,
}: {
  suppliers: Supplier[];
  settlements: SupplierSettlement[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [cutoffDate, setCutoffDate] = useState("");
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [paymentEgp, setPaymentEgp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function responsePayload(response: Response) {
    return (await response.json()) as { error?: string; preview?: SettlementPreview };
  }

  async function previewSettlement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/supplier-settlements/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, cutoffDate }),
    });
    const result = await responsePayload(response);
    setBusy(false);
    if (!response.ok || !result.preview) return setError(result.error ?? "تعذر معاينة التسوية.");
    setPreview(result.preview);
    setPaymentEgp(String(result.preview.suggestedPaymentPiasters / 100));
  }

  async function confirm() {
    if (!preview) return;
    const paymentPiasters = piasters(paymentEgp);
    if (paymentPiasters === null) return setError("أدخل مبلغ دفع صحيحًا بالجنيه.");
    if (!window.confirm("اعتماد التسوية سيجمد الحقائق المعروضة في الإيصال. هل تريد المتابعة؟"))
      return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/supplier-settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        settlementId: crypto.randomUUID(),
        supplierId: preview.supplierId,
        cutoffDate: preview.cutoffDate,
        paymentPiasters,
      }),
    });
    const result = (await response.json()) as { error?: string; settlement?: SupplierSettlement };
    setBusy(false);
    if (!response.ok || !result.settlement) return setError(result.error ?? "تعذر اعتماد التسوية.");
    setPreview(null);
    setPaymentEgp("");
    router.push(`/supplier-settlements/${result.settlement.id}/print`);
    router.refresh();
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          تسويات الموردين
        </Typography>
        <Typography color="text.secondary">
          اعرض الحقائق غير المسواة، ثم اعتمد لقطة ثابتة وإيصالًا قابلًا للطباعة.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Card component="form" onSubmit={previewSettlement}>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              معاينة تسوية
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                select
                label="المورد"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
                sx={{ minWidth: 260 }}
              >
                {suppliers.map((supplier) => (
                  <MenuItem key={supplier.id} value={supplier.id}>
                    {supplier.displayName}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="حتى تاريخ"
                type="date"
                value={cutoffDate}
                onChange={(event) => setCutoffDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !supplierId || !cutoffDate}
              >
                عرض المعاينة
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      {preview && (
        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <Typography component="h2" variant="h2">
                معاينة غير معتمدة
              </Typography>
              <Typography>رصيد افتتاحي: {formatPiasters(preview.openingCarryPiasters)}</Typography>
              <Typography>
                لبن: {formatPiasters(preview.milkTotalPiasters)} ({preview.milkLines.length} حركة)
              </Typography>
              <Typography>
                حركات: {formatPiasters(preview.movementTotalPiasters)} ({preview.movements.length}{" "}
                حركة)
              </Typography>
              <Typography>قبل الدفع: {formatPiasters(preview.beforePaymentPiasters)}</Typography>
              <Typography>
                الدفع المقترح: {formatPiasters(preview.suggestedPaymentPiasters)}
                {preview.holdPayment ? " (تعليمات إيقاف الدفع مفعلة)" : ""}
              </Typography>
              <Divider />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  label="الدفع الفعلي بالجنيه"
                  value={paymentEgp}
                  onChange={(event) => setPaymentEgp(event.target.value)}
                  inputMode="decimal"
                  sx={{ minWidth: 220 }}
                />
                <Button
                  type="button"
                  variant="contained"
                  color="success"
                  disabled={busy}
                  onClick={confirm}
                >
                  اعتماد وإنشاء الإيصال
                </Button>
              </Stack>
              <Typography color="text.secondary" variant="body2">
                اقتراح الخصم استشاري فقط؛ لا ينشئ حركة مخفية. الدفع الفعلي هنا وحده هو حركة دفع
                التسوية.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Stack spacing={1}>
        <Typography component="h2" variant="h2">
          التسويات السابقة
        </Typography>
        {settlements.map((settlement) => (
          <Card key={settlement.id}>
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { sm: "center" } }}
              >
                <Typography sx={{ flexGrow: 1 }}>
                  {settlement.cutoffDate} · رصيد مرحل{" "}
                  {formatPiasters(settlement.closingCarryPiasters)}
                </Typography>
                <Button
                  component={Link}
                  href={`/supplier-settlements/${settlement.id}/print`}
                  variant="outlined"
                >
                  فتح الإيصال
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
        {settlements.length === 0 && (
          <Typography color="text.secondary">لا توجد تسويات بعد.</Typography>
        )}
      </Stack>
    </Stack>
  );
}
