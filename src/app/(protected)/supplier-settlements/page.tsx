import { listOwnerSuppliers } from "@/modules/suppliers/application/supplier-service";
import { listSettlements } from "@/modules/suppliers/application/settlement-service";
import { SettlementPanel } from "./settlement-panel";

export default async function SupplierSettlementsPage() {
  const [suppliers, settlements] = await Promise.all([listOwnerSuppliers(), listSettlements()]);
  return <SettlementPanel suppliers={suppliers} settlements={settlements} />;
}
