import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getSettings, listActiveVariants } from "@/modules/inventory";
import { SettingsPanel } from "./settings-panel";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string; restored?: string }>;
}) {
  const [settings, variants] = await Promise.all([getSettings(), listActiveVariants()]);
  const query = await searchParams;
  return (
    <Stack spacing={3}>
      <div>
        <Typography component="h1" variant="h1">
          الإعدادات والصيانة
        </Typography>
        <Typography color="text.secondary">تغييرات الأوزان تحافظ على تاريخ الحركات.</Typography>
      </div>
      {query.restored === "1" && (
        <Alert severity={query.legacy === "1" ? "warning" : "success"}>
          {query.legacy === "1"
            ? "تمت استعادة نسخة قديمة تحتوي على بيانات المخزون فقط. أعد إنشاء نسخة v2 بعد مراجعة البيانات."
            : "تمت استعادة النسخة الاحتياطية بنجاح."}
        </Alert>
      )}
      <SettingsPanel settings={settings} variants={variants} />
    </Stack>
  );
}
