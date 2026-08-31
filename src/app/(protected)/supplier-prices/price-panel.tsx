"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPiasters } from "@/modules/suppliers/domain/money";
import type { MilkPricePeriod } from "@/modules/suppliers";

function piasters(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim().replace("٫", "."));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function PricePanel({ prices }: { prices: MilkPricePeriod[] }) {
  const router = useRouter();
  const [milkType, setMilkType] = useState<"COW" | "BUFFALO">("COW");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [priceEgp, setPriceEgp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pricePiastersPerSatl = piasters(priceEgp);
    if (!pricePiastersPerSatl) return setError("أدخل سعرًا صحيحًا بالجنيه.");
    setBusy(true);
    setError(null);
    const response = await fetch("/api/supplier-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        milkType,
        effectiveFrom,
        pricePiastersPerSatl,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "تعذر حفظ السعر.");
    setPriceEgp("");
    router.refresh();
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          أسعار اللبن
        </Typography>
        <Typography color="text.secondary">
          السعر يسري من تاريخ محدد. لا يغير أي تسوية تم اعتمادها سابقًا.
        </Typography>
      </Box>
      <Card component="form" onSubmit={submit}>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h2">
              إضافة سعر تاريخي
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                select
                label="نوع اللبن"
                value={milkType}
                onChange={(event) => setMilkType(event.target.value as "COW" | "BUFFALO")}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="COW">لبن بقري</MenuItem>
                <MenuItem value="BUFFALO">لبن جاموسي</MenuItem>
              </TextField>
              <TextField
                label="يسري من"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
              <TextField
                label="سعر السطل بالجنيه"
                value={priceEgp}
                onChange={(event) => setPriceEgp(event.target.value)}
                inputMode="decimal"
                required
              />
            </Stack>
            <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: "start" }}>
              حفظ السعر
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack component="ul" spacing={1.25} sx={{ p: 0, m: 0 }}>
        {prices.map((price) => (
          <Card key={price.id} component="li" sx={{ listStyle: "none" }}>
            <CardContent>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Typography sx={{ flexGrow: 1 }}>
                  {price.milkType === "COW" ? "لبن بقري" : "لبن جاموسي"}
                </Typography>
                <Typography>{price.effectiveFrom}</Typography>
                <Typography sx={{ fontWeight: 800 }}>
                  {formatPiasters(price.pricePiastersPerSatl)} / سطل
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ))}
        {prices.length === 0 && <Typography color="text.secondary">لم تسجل أسعار بعد.</Typography>}
      </Stack>
    </Stack>
  );
}
