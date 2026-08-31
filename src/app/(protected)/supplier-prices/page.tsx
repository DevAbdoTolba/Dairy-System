import { listPricePeriods } from "@/modules/suppliers/application/account-service";
import { PricePanel } from "./price-panel";

export default async function SupplierPricesPage() {
  return <PricePanel prices={await listPricePeriods()} />;
}
