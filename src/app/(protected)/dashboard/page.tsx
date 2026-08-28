import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getDashboard } from "@/modules/dashboard/application/dashboard-service";
import { formatArabicDate } from "@/shared/dates/business-date";
import { UndoLastEntry } from "./undo-last-entry";

export default function DashboardPage() {
  const dashboard = getDashboard();
  const actions = [
    ["PRODUCTION", "إضافة تصنيع", "success"],
    ["SALE", "إضافة بيع", "error"],
    ["RETURN", "إضافة مرتجع", "secondary"],
  ] as const;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h1">
          اليوم: {formatArabicDate(dashboard.today)}
        </Typography>
        <Typography color="text.secondary">
          سجّل الحركة فوراً ليبقى الرصيد مطابقاً للمخزن.
        </Typography>
      </Box>
      {dashboard.noEntriesToday && <Alert severity="warning">لم يتم تسجيل حركة اليوم.</Alert>}
      {dashboard.noEntriesYesterday && (
        <Alert severity="info">
          تنبيه: لم تُسجل حركة أمس. راجع يوم الإغلاق إن كان هناك تصنيع أو بيع أو مرتجع.
        </Alert>
      )}
      <Box>
        <Typography component="h2" variant="h2" sx={{ mb: 1.5 }}>
          إدخال سريع
        </Typography>
        <Grid container spacing={1.5}>
          {actions.map(([type, label, color]) => (
            <Grid key={type} size={{ xs: 12, sm: 4 }}>
              <Button
                href={`/transactions/${type}`}
                variant="contained"
                color={color}
                fullWidth
                startIcon={<AddCircleOutlineIcon />}
              >
                {label}
              </Button>
            </Grid>
          ))}
        </Grid>
      </Box>
      {dashboard.lastTransaction && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Typography>آخر حركة: {dashboard.lastTransaction.quantity} صفيحة</Typography>
          <UndoLastEntry id={dashboard.lastTransaction.id} />
        </Stack>
      )}
      <Box>
        <Typography component="h2" variant="h2" sx={{ mb: 1.5 }}>
          الرصيد الحالي
        </Typography>
        <Grid container spacing={2}>
          {dashboard.inventory.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">{item.nameAr}</Typography>
                  <Typography variant="h2">{item.stock} صفيحة</Typography>
                  <Typography color="text.secondary">{item.kilograms} كجم</Typography>
                  {item.stock <= 0 && (
                    <Alert severity={item.stock < 0 ? "error" : "warning"} sx={{ mt: 1 }}>
                      {item.stock < 0 ? "رصيد سالب" : "الرصيد صفر"}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
      <Card>
        <CardContent>
          <Typography component="h2" variant="h2">
            ملخص اليوم
          </Typography>
          <Stack direction="row" spacing={3} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
            <Typography>تصنيع: {dashboard.todayMetrics.production}</Typography>
            <Typography>بيع: {dashboard.todayMetrics.sales}</Typography>
            <Typography>مرتجع: {dashboard.todayMetrics.returns}</Typography>
          </Stack>
          <Button href="/history" variant="text" endIcon={<ReplayOutlinedIcon />} sx={{ mt: 1 }}>
            عرض السجل
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
