import { PosWorkspace } from "@/modules/suppliers/ui/pos-workspace";
import { getSession } from "@/modules/auth/infrastructure/session";
import { todayInCairo } from "@/shared/dates/business-date";

export default async function PosPage() {
  const session = await getSession();
  return <PosWorkspace businessDate={todayInCairo()} credentialRole={session?.role ?? "POS"} />;
}
