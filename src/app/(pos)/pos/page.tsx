import { PosWorkspace } from "@/modules/suppliers/ui/pos-workspace";
import { todayInCairo } from "@/shared/dates/business-date";

export default function PosPage() {
  return <PosWorkspace businessDate={todayInCairo()} />;
}
