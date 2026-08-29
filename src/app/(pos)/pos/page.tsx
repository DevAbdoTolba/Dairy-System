import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function PosPage() {
  return (
    <Paper component="main" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={1}>
        <Typography component="h1" variant="h1">
          استلام اللبن
        </Typography>
        <Typography color="text.secondary">
          شاشة الوردية جاهزة. سيتم إضافة اختيار المورد وتسجيل اللبن في المرحلة التالية.
        </Typography>
      </Stack>
    </Paper>
  );
}
