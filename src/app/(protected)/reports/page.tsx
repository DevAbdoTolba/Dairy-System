import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getReport } from "@/modules/reports/application/report-service";
import { todayInCairo } from "@/shared/dates/business-date";

function firstDayOfMonth() {
  return `${todayInCairo().slice(0, 7)}-01`;
}
function percentage(value: number | null) {
  return value === null ? "—" : `${value}%`;
}
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const search = await searchParams;
  const from = search.from ?? firstDayOfMonth();
  const to = search.to ?? todayInCairo();
  const report = await getReport(from, to);
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          التقارير
        </Typography>
        <Typography color="text.secondary">
          نسبة البيع = المبيع ÷ المصنع × 100. نسبة المرتجع = المرتجع ÷ المبيع × 100.
        </Typography>
      </Box>
      <Paper component="form" method="get" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            name="from"
            label="من تاريخ"
            type="date"
            defaultValue={from}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            name="to"
            label="إلى تاريخ"
            type="date"
            defaultValue={to}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button type="submit" variant="contained">
            عرض الفترة
          </Button>
          <Button
            component="a"
            href={`/api/reports/export?from=${from}&to=${to}`}
            variant="outlined"
          >
            تصدير CSV
          </Button>
        </Stack>
      </Paper>
      <Grid container spacing={2}>
        {[
          ["تصنيع", report.metrics.production],
          ["بيع", report.metrics.sales],
          ["مرتجع", report.metrics.returns],
          ["نسبة البيع", percentage(report.metrics.sellThrough)],
          ["نسبة المرتجع", percentage(report.metrics.returnRate)],
        ].map(([label, value]) => (
          <Grid key={String(label)} size={{ xs: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">{label}</Typography>
                <Typography variant="h2">{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Paper sx={{ overflowX: "auto" }}>
        <Table aria-label="التقرير حسب الوزن">
          <TableHead>
            <TableRow>
              <TableCell>الوزن</TableCell>
              <TableCell>تصنيع</TableCell>
              <TableCell>بيع</TableCell>
              <TableCell>مرتجع</TableCell>
              <TableCell>نسبة البيع</TableCell>
              <TableCell>نسبة المرتجع</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.byWeight.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.nameAr}</TableCell>
                <TableCell>{item.metrics.production}</TableCell>
                <TableCell>{item.metrics.sales}</TableCell>
                <TableCell>{item.metrics.returns}</TableCell>
                <TableCell>{percentage(item.metrics.sellThrough)}</TableCell>
                <TableCell>{percentage(item.metrics.returnRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
