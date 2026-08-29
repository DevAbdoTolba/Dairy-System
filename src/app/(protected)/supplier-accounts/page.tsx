import {
  listPendingPosCash,
  listSupplierAccountSummaries,
} from "@/modules/suppliers/application/account-service";
import { AccountPanel } from "./account-panel";

export default async function SupplierAccountsPage() {
  const [accounts, pendingCash] = await Promise.all([
    listSupplierAccountSummaries(),
    listPendingPosCash(),
  ]);
  return <AccountPanel accounts={accounts} pendingCash={pendingCash} />;
}
