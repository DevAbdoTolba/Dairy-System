import { listOwnerSuppliers } from "@/modules/suppliers/application/supplier-service";
import { SupplierAdmin } from "./supplier-admin";

export default async function SuppliersPage() {
  return <SupplierAdmin suppliers={await listOwnerSuppliers()} />;
}
