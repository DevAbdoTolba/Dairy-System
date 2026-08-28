import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { listActiveVariants, listTransactions } from "@/modules/inventory";
import { transactionTypes } from "@/modules/transactions/domain/transaction";
import { TransactionBadge } from "@/shared/design-system/transaction-badge";
import { VoidButton } from "./void-button";

type Search = { from?: string; to?: string; type?: string; variant?: string; voided?: string };
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const type = transactionTypes.includes(search.type as (typeof transactionTypes)[number])
    ? (search.type as (typeof transactionTypes)[number])
    : undefined;
  const entries = listTransactions({
    from: search.from,
    to: search.to,
    type,
    variantId: search.variant,
    includeVoided: search.voided === "1",
  });
  const variants = listActiveVariants();
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          سجل الحركات
        </Typography>
        <Typography color="text.secondary">
          الأحدث أولاً. يمكن إلغاء الحركة مع الاحتفاظ بسجلها.
        </Typography>
      </Box>
      <Paper component="form" method="get" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            name="from"
            label="من تاريخ"
            type="date"
            defaultValue={search.from}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            name="to"
            label="إلى تاريخ"
            type="date"
            defaultValue={search.to}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField select name="type" label="النوع" defaultValue={search.type ?? ""}>
            <option value="">كل الأنواع</option>
            {transactionTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </TextField>
          <TextField select name="variant" label="الوزن" defaultValue={search.variant ?? ""}>
            <option value="">كل الأوزان</option>
            {variants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameAr}
              </option>
            ))}
          </TextField>
          <Button type="submit" variant="contained">
            تطبيق
          </Button>
        </Stack>
      </Paper>
      {entries.length === 0 ? (
        <Alert severity="info">لا توجد حركات مطابقة للفلاتر.</Alert>
      ) : (
        <Paper sx={{ overflowX: "auto" }}>
          <Table aria-label="سجل الحركات">
            <TableHead>
              <TableRow>
                <TableCell>التاريخ</TableCell>
                <TableCell>النوع</TableCell>
                <TableCell>الوزن</TableCell>
                <TableCell>الكمية</TableCell>
                <TableCell>ملاحظة</TableCell>
                <TableCell>إجراء</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  sx={entry.status === "VOIDED" ? { opacity: 0.58 } : undefined}
                >
                  <TableCell>{entry.businessDate}</TableCell>
                  <TableCell>
                    <TransactionBadge type={entry.type} />
                    {entry.status === "VOIDED" && " — ملغاة"}
                  </TableCell>
                  <TableCell>{entry.weightKg} كجم</TableCell>
                  <TableCell>{entry.quantity}</TableCell>
                  <TableCell>{entry.note ?? "—"}</TableCell>
                  <TableCell>
                    {entry.status === "ACTIVE" ? <VoidButton id={entry.id} /> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
