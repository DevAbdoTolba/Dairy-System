import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getSettings, listActiveVariants } from "@/modules/inventory";
import { SettingsPanel } from "./settings-panel";

export default async function SettingsPage() {
  const [settings, variants] = await Promise.all([getSettings(), listActiveVariants()]);
  return (
    <Stack spacing={3}>
      <div>
        <Typography component="h1" variant="h1">
          الإعدادات والصيانة
        </Typography>
        <Typography color="text.secondary">تغييرات الأوزان تحافظ على تاريخ الحركات.</Typography>
      </div>
      <SettingsPanel settings={settings} variants={variants} />
    </Stack>
  );
}
