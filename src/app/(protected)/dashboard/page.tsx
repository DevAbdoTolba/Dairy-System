import { getDashboard } from "@/modules/dashboard/application/dashboard-service";
import { listActiveVariants } from "@/modules/inventory";
import { TabletWorkbench } from "./tablet-workbench";

export default async function DashboardPage() {
  const [dashboard, variants] = await Promise.all([getDashboard(), listActiveVariants()]);
  return <TabletWorkbench dashboard={dashboard} variants={variants} />;
}
