import {
  listCashInputAudits,
  listPendingPosCash,
  listSupplierAccountSummaries,
} from "@/modules/suppliers/application/account-service";
import { AccountPanel } from "./account-panel";

export default async function SupplierAccountsPage() {
  const [accounts, pendingCash, cashInputAudits] = await Promise.all([
    listSupplierAccountSummaries(),
    listPendingPosCash(),
    listCashInputAudits(),
  ]);
  return (
    <AccountPanel accounts={accounts} pendingCash={pendingCash} cashInputAudits={cashInputAudits} />
  );
}
