"use client";

import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { todayInCairo } from "@/shared/dates/business-date";
import { submitTransactionOfflineFirst } from "@/shared/offline/offline-sync";
import { transactionMeta, type TransactionType } from "../domain/transaction";
import type { ProductVariant } from "@/modules/inventory";

type StoredEntry = {
  productVariantId: string;
  quantity: number;
  businessDate: string;
  note?: string;
};

export function TransactionForm({
  type,
  variants,
  embedded = false,
  stockByVariant,
  initialVariantId,
}: {
  type: TransactionType;
  variants: ProductVariant[];
  /** Removes the outer card when this form is placed inside the tablet workbench. */
  embedded?: boolean;
  /** Last server balance plus any locally queued operations. */
  stockByVariant?: Record<string, number>;
  /** Opens the form with a weight selected by the parent workbench. */
  initialVariantId?: string;
}) {
  const router = useRouter();
  const quantityRef = useRef<HTMLInputElement>(null);
  const [variantId, setVariantId] = useState(
    variants.some((variant) => variant.id === initialVariantId)
      ? (initialVariantId ?? "")
      : (variants[0]?.id ?? ""),
  );
  const [quantity, setQuantity] = useState(1);
  const [businessDate, setBusinessDate] = useState(todayInCairo());
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [allowNegative, setAllowNegative] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `dairy-last-entry-${type}`;
  const meta = transactionMeta[type];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initialVariantId && variants.some((variant) => variant.id === initialVariantId)) {
        setVariantId(initialVariantId);
        return;
      }
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      try {
        const value = JSON.parse(stored) as StoredEntry;
        if (variants.some((variant) => variant.id === value.productVariantId)) {
          setVariantId(value.productVariantId);
        }
      } catch {
        /* corrupted optional local preference is safely ignored */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialVariantId, storageKey, variants]);

  function selectVariant(id: string) {
    setVariantId(id);
    requestAnimationFrame(() => quantityRef.current?.focus());
  }

  function repeatLast() {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as StoredEntry;
      setVariantId(value.productVariantId);
      setQuantity(value.quantity);
      setBusinessDate(todayInCairo());
      setNote(value.note ?? "");
      setMessage("تم تجهيز آخر إدخال للمراجعة والحفظ.");
    } catch {
      setError("تعذر قراءة آخر إدخال.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      setError("اختر الوزن وأدخل كمية صحيحة.");
      return;
    }
    if (allowNegative && !overrideReason.trim()) {
      setError("اكتب سبباً للسماح بالرصيد السالب.");
      return;
    }
    const lowersStock = type === "SALE" || type === "ADJUSTMENT_OUT";
    const estimatedStock = stockByVariant?.[variantId];
    if (
      lowersStock &&
      !allowNegative &&
      estimatedStock !== undefined &&
      quantity > estimatedStock
    ) {
      setError(`الرصيد المتاح على هذا الجهاز هو ${estimatedStock} صفيحة فقط.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitTransactionOfflineFirst({
        productVariantId: variantId,
        type,
        quantity,
        businessDate,
        note,
        allowNegative,
        overrideReason,
        idempotencyKey: crypto.randomUUID(),
      });
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          productVariantId: variantId,
          quantity,
          businessDate,
          note,
        } satisfies StoredEntry),
      );
      setMessage(
        result.status === "queued"
          ? "تم حفظ الحركة على الجهاز وستُزامن تلقائياً عند عودة الإنترنت."
          : result.duplicate
            ? "كانت هذه الحركة محفوظة بالفعل."
            : "تم حفظ الحركة وتحديث الرصيد.",
      );
      setQuantity(1);
      setNote("");
      setAllowNegative(false);
      setOverrideReason("");
      if (result.status === "synced") router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الحركة.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper
      component="form"
      onSubmit={submit}
      elevation={embedded ? 0 : 1}
      sx={{
        p: embedded ? 0 : { xs: 2, sm: 3 },
        maxWidth: embedded ? "none" : 760,
        bgcolor: embedded ? "transparent" : undefined,
        border: embedded ? 0 : undefined,
      }}
    >
      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <Box>
          <Typography variant="h1">إضافة {meta.label}</Typography>
          <Typography color="text.secondary">اختر الوزن ثم الكمية واحفظ.</Typography>
        </Box>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        {message && (
          <Alert severity="success" role="status">
            {message}
          </Alert>
        )}
        <Box>
          <Typography component="h2" variant="h3" sx={{ mb: 1 }}>
            وزن الصفيحة
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {variants.map((variant) => (
              <Button
                key={variant.id}
                type="button"
                onClick={() => selectVariant(variant.id)}
                variant={variantId === variant.id ? "contained" : "outlined"}
                aria-pressed={variantId === variant.id}
                sx={{ minWidth: 110 }}
              >
                {variant.weightKg} كجم
              </Button>
            ))}
          </Stack>
        </Box>
        <Box>
          <Typography component="h2" variant="h3" sx={{ mb: 1 }}>
            عدد الصفائح
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              aria-label="إنقاص الكمية"
            >
              <RemoveIcon />
            </Button>
            <TextField
              inputRef={quantityRef}
              label="الكمية"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, step: 1, inputMode: "numeric" } }}
              sx={{ maxWidth: 220 }}
            />
            <Button
              type="button"
              variant="outlined"
              onClick={() => setQuantity((value) => value + 1)}
              aria-label="زيادة الكمية"
            >
              <AddIcon />
            </Button>
          </Stack>
        </Box>
        <TextField
          label="التاريخ"
          type="date"
          value={businessDate}
          onChange={(event) => setBusinessDate(event.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayInCairo() } }}
        />
        <Button type="button" variant="text" onClick={() => setShowNote((value) => !value)}>
          {showNote ? "إخفاء الملاحظة" : "إضافة ملاحظة اختيارية"}
        </Button>
        {showNote && (
          <TextField
            label="ملاحظة"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        )}
        {(type === "SALE" || type === "ADJUSTMENT_OUT") && (
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={allowNegative}
                  onChange={(event) => setAllowNegative(event.target.checked)}
                />
              }
              label="السماح بالرصيد السالب (عند الضرورة فقط)"
            />
            {allowNegative && (
              <TextField
                label="سبب التجاوز"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                required
              />
            )}
          </Box>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "جارٍ الحفظ…" : "حفظ الحركة"}
          </Button>
          <Button type="button" variant="outlined" onClick={repeatLast}>
            تكرار آخر إدخال
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
