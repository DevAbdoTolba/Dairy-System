import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getSupplierSettlement } from "@/modules/suppliers/application/settlement-service";
import { getSupplier } from "@/modules/suppliers/infrastructure/repository";
import { formatPiasters } from "@/modules/suppliers/domain/money";

export default async function SupplierSettlementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const settlement = await getSupplierSettlement((await params).id);
  const supplier = await getSupplier(settlement.supplierId);
  return (
    <Paper component="main" className="print-receipt" sx={{ p: 3, maxWidth: 760, mx: "auto" }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography component="h1" variant="h1">
            إيصال تسوية مورد
          </Typography>
          <Typography>
            {supplier?.displayName ?? "مورد"} ·{" "}
            {settlement.milkType === "COW" ? "لبن بقري" : "لبن جاموسي"} · حتى{" "}
            {settlement.cutoffDate}
          </Typography>
        </Box>
        <Divider />
        <Typography>رصيد افتتاحي: {formatPiasters(settlement.openingCarryPiasters)}</Typography>
        <Typography>إجمالي اللبن: {formatPiasters(settlement.milkTotalPiasters)}</Typography>
        <Typography>إجمالي الحركات: {formatPiasters(settlement.movementTotalPiasters)}</Typography>
        <Typography>المدفوع: {formatPiasters(settlement.paymentPiasters)}</Typography>
        <Typography sx={{ fontWeight: 800 }}>
          الرصيد المرحل: {formatPiasters(settlement.closingCarryPiasters)}
        </Typography>
        <Divider />
        <Typography component="h2" variant="h2">
          لبن داخل التسوية
        </Typography>
        {settlement.milkLines.map((line) => (
          <Typography key={line.entryId}>
            {line.businessDate} · {line.milkType === "COW" ? "بقري" : "جاموسي"} ·{" "}
            {formatPiasters(line.valuePiasters)}
          </Typography>
        ))}
        <Typography color="text.secondary" variant="body2">
          هذه لقطة حسابية ثابتة، ولا تتغير إذا تغير السعر لاحقًا.
        </Typography>
      </Stack>
    </Paper>
  );
}
