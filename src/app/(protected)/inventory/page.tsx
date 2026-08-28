import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getInventorySummary } from "@/modules/inventory";

export default function InventoryPage() {
  const inventory = getInventorySummary();
  const totalKilograms = inventory.reduce((sum, item) => sum + item.kilograms, 0);
  return (
    <Stack spacing={3}>
      <div>
        <Typography component="h1" variant="h1">
          المخزون الحالي
        </Typography>
        <Typography color="text.secondary">
          الرصيد محسوب من سجل الحركات ولا يُعدّل يدوياً.
        </Typography>
      </div>
      <Grid container spacing={2}>
        {inventory.map((item) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h2">{item.nameAr}</Typography>
                <Typography sx={{ fontSize: "1.55rem", fontWeight: 800, mt: 1 }}>
                  {item.stock} صفيحة · {item.kilograms} كجم
                </Typography>
                <Stack direction="row" useFlexGap spacing={2} sx={{ mt: 2, flexWrap: "wrap" }}>
                  <Typography>تصنيع: {item.produced}</Typography>
                  <Typography>بيع: {item.sold}</Typography>
                  <Typography>مرتجع: {item.returned}</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h2">إجمالي الوزن في المخزن</Typography>
          <Typography sx={{ fontSize: "1.6rem", fontWeight: 800 }}>{totalKilograms} كجم</Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
