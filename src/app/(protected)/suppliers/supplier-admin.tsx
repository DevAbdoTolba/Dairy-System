"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Supplier } from "@/modules/suppliers";
import { milkTypes, type MilkType } from "@/modules/suppliers/domain/shift";

type SupplierPayload = { supplier?: Supplier; error?: string };

const demoSuppliers: Array<{ displayName: string; milkTypes: MilkType[] }> = [
  { displayName: "أم أحمد", milkTypes: ["COW"] },
  { displayName: "فاطمة حسن", milkTypes: ["BUFFALO"] },
  { displayName: "زينب علي", milkTypes: ["COW", "BUFFALO"] },
  { displayName: "هدى إبراهيم", milkTypes: ["COW"] },
  { displayName: "سعاد محمود", milkTypes: ["BUFFALO"] },
  { displayName: "نجاة يوسف", milkTypes: ["COW", "BUFFALO"] },
  { displayName: "صفية عبد الله", milkTypes: ["COW"] },
  { displayName: "أمينة محمد", milkTypes: ["BUFFALO"] },
];

const milkLabels: Record<MilkType, string> = { COW: "لبن بقري", BUFFALO: "لبن جاموسي" };

function MilkTypePicker({
  value,
  onChange,
}: {
  value: MilkType[];
  onChange: (value: MilkType[]) => void;
}) {
  function toggle(type: MilkType) {
    if (value.includes(type)) {
      if (value.length === 1) return;
      onChange(value.filter((item) => item !== type));
      return;
    }
    onChange(milkTypes.filter((item) => value.includes(item) || item === type));
  }

  return (
    <Stack spacing={0.75}>
      <Typography component="p" sx={{ fontWeight: 700 }}>
        نوع اللبن الذي يأتي به المورد
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {milkTypes.map((type) => (
          <Button
            key={type}
            type="button"
            variant={value.includes(type) ? "contained" : "outlined"}
            aria-pressed={value.includes(type)}
            onClick={() => toggle(type)}
            sx={{ minHeight: 48 }}
          >
            {milkLabels[type]}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

async function responsePayload(response: Response) {
  return (await response.json()) as SupplierPayload;
}

function SupplierRow({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(supplier.displayName);
  const [posInstruction, setPosInstruction] = useState(supplier.posInstruction ?? "");
  const [supplierMilkTypes, setSupplierMilkTypes] = useState<MilkType[]>(supplier.milkTypes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, posInstruction, milkTypes: supplierMilkTypes }),
    });
    const result = await responsePayload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر حفظ المورد.");
    router.refresh();
  }

  async function changeActive() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !supplier.active }),
    });
    const result = await responsePayload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر تعديل حالة المورد.");
    router.refresh();
  }

  return (
    <Card component="li" sx={{ listStyle: "none" }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography component="h3" variant="h3" sx={{ flexGrow: 1 }}>
              {supplier.displayName}
            </Typography>
            <Chip
              size="small"
              color={supplier.active ? "success" : "default"}
              label={supplier.active ? "نشط" : "موقوف"}
            />
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="اسم المورد"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <MilkTypePicker value={supplierMilkTypes} onChange={setSupplierMilkTypes} />
          <TextField
            label="تعليمات تظهر للعاملات"
            value={posInstruction}
            onChange={(event) => setPosInstruction(event.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button type="button" variant="contained" disabled={busy} onClick={save}>
              حفظ التعديل
            </Button>
            <Button
              type="button"
              color={supplier.active ? "warning" : "success"}
              variant="outlined"
              disabled={busy}
              onClick={changeActive}
            >
              {supplier.active ? "إيقاف المورد" : "إعادة التفعيل"}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SupplierAdmin({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [posInstruction, setPosInstruction] = useState("");
  const [supplierMilkTypes, setSupplierMilkTypes] = useState<MilkType[]>([...milkTypes]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, posInstruction, milkTypes: supplierMilkTypes }),
    });
    const result = await responsePayload(response);
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر إضافة المورد.");
    setDisplayName("");
    setPosInstruction("");
    setSupplierMilkTypes([...milkTypes]);
    router.refresh();
  }

  async function addDemoSuppliers() {
    setBusy(true);
    setError(null);
    try {
      const existingNames = new Set(suppliers.map((supplier) => supplier.displayName));
      for (const supplier of demoSuppliers) {
        if (existingNames.has(supplier.displayName)) continue;
        const response = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(supplier),
        });
        const result = await responsePayload(response);
        if (!response.ok) throw new Error(result.error ?? "تعذر إضافة الموردين للتجربة.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إضافة الموردين للتجربة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          الموردون
        </Typography>
        <Typography color="text.secondary">
          أضف الموردين ورتّب التعليمات المختصرة التي تراها شاشة الاستلام فقط.
        </Typography>
      </Box>
      <Card component="form" onSubmit={addSupplier}>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              إضافة مورد
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="اسم المورد بالعربية"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
            <MilkTypePicker value={supplierMilkTypes} onChange={setSupplierMilkTypes} />
            <TextField
              label="تعليمات للعاملات (اختياري)"
              value={posInstruction}
              onChange={(event) => setPosInstruction(event.target.value)}
              multiline
              minRows={2}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              إضافة المورد
            </Button>
            <Button type="button" variant="outlined" disabled={busy} onClick={addDemoSuppliers}>
              إضافة موردين للتجربة
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack component="ul" spacing={1.5} sx={{ p: 0, m: 0 }}>
        {suppliers.map((supplier) => (
          <SupplierRow key={supplier.id} supplier={supplier} />
        ))}
      </Stack>
    </Stack>
  );
}
