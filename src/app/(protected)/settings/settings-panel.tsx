"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductVariant } from "@/modules/inventory";

export function SettingsPanel({
  settings,
  variants,
}: {
  settings: { businessName: string; startDate: string; timezone: string };
  variants: ProductVariant[];
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [startDate, setStartDate] = useState(settings.startDate);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWeight, setNewWeight] = useState(0);
  const [newName, setNewName] = useState("");
  const [posPin, setPosPin] = useState("");
  async function save() {
    setError(null);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, startDate }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "تعذر الحفظ.");
      return;
    }
    setMessage("تم حفظ الإعدادات.");
    router.refresh();
  }
  async function backup() {
    setError(null);
    const response = await fetch("/api/backup");
    if (!response.ok) {
      setError("تعذر إنشاء النسخة الاحتياطية.");
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = response.headers.get("x-backup-file") ?? "dairy-backup.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage("تم إنشاء وتنزيل نسخة احتياطية تم التحقق منها.");
  }
  async function addWeight() {
    const response = await fetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weightKg: newWeight,
        nameAr: newName || `${newWeight} كجم`,
        visualToken: "weight-custom",
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "تعذر إضافة الوزن.");
      return;
    }
    setNewWeight(0);
    setNewName("");
    setMessage("تمت إضافة فئة الوزن.");
    router.refresh();
  }
  async function savePosPin() {
    setError(null);
    const response = await fetch("/api/auth/pos-pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: posPin }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "تعذر تغيير رمز استلام اللبن.");
      return;
    }
    setPosPin("");
    setMessage("تم تغيير رمز استلام اللبن. ستنتهي جلسات الاستلام الحالية عند اتصالها.");
  }
  async function archive(id: string) {
    if (!window.confirm("إيقاف هذه الفئة؟ لن تُحذف الحركات السابقة.")) return;
    const response = await fetch(`/api/variants/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("تعذر إيقاف الفئة.");
      return;
    }
    router.refresh();
  }
  function confirmRestore(event: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm("سيتم استبدال بيانات النظام بعد عمل نسخة أمان. هل أنت متأكد؟"))
      event.preventDefault();
  }
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert severity="success" role="status">
          {message}
        </Alert>
      )}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              رمز استلام اللبن
            </Typography>
            <Typography color="text.secondary">
              تستخدمه العاملات للدخول إلى شاشة الاستلام فقط، ولا يمنح وصولاً إلى الحسابات أو
              التقارير.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="رمز جديد لاستلام اللبن"
                type="password"
                value={posPin}
                onChange={(event) => setPosPin(event.target.value)}
                slotProps={{ htmlInput: { inputMode: "numeric", minLength: 6 } }}
              />
              <Button
                type="button"
                variant="contained"
                disabled={posPin.length < 6}
                onClick={savePosPin}
              >
                تغيير الرمز
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              بيانات المعمل
            </Typography>
            <TextField
              label="اسم المعمل"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <TextField
              label="تاريخ بدء السجل"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Typography color="text.secondary">المنطقة الزمنية: {settings.timezone}</Typography>
            <Button type="button" variant="contained" onClick={save}>
              حفظ الإعدادات
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              فئات الأوزان
            </Typography>
            {variants.map((variant) => (
              <Stack
                key={variant.id}
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
              >
                <Typography>{variant.nameAr}</Typography>
                <Button
                  type="button"
                  color="warning"
                  variant="outlined"
                  onClick={() => archive(variant.id)}
                >
                  إيقاف الفئة
                </Button>
              </Stack>
            ))}
            <Divider />
            <Typography variant="h3">إضافة فئة وزن</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="الوزن بالكيلو"
                type="number"
                value={newWeight || ""}
                onChange={(event) => setNewWeight(Number(event.target.value))}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                label="الاسم بالعربية"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Button type="button" variant="outlined" onClick={addWeight}>
                إضافة
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              النسخ الاحتياطي والاستعادة
            </Typography>
            <Typography color="text.secondary">
              ينشئ النظام نسخة متسقة من قاعدة البيانات ويجري فحص سلامتها قبل تنزيلها.
            </Typography>
            <Button type="button" variant="contained" onClick={backup}>
              إنشاء نسخة احتياطية
            </Button>
            <Box
              component="form"
              action="/api/restore"
              method="post"
              encType="multipart/form-data"
              onSubmit={confirmRestore}
            >
              <Stack spacing={1}>
                <Typography variant="h3">استعادة نسخة</Typography>
                <input name="backup" type="file" accept=".json,application/json" required />
                <Button type="submit" color="warning" variant="outlined">
                  استعادة النسخة المحددة
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography component="h2" variant="h2">
            فحص النظام
          </Typography>
          <Button
            component="a"
            href="/api/health"
            target="_blank"
            variant="outlined"
            sx={{ mt: 1 }}
          >
            عرض حالة النظام
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
