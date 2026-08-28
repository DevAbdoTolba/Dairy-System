import Chip from "@mui/material/Chip";
import type { TransactionType } from "@/modules/transactions/domain/transaction";
import { transactionMeta } from "@/modules/transactions/domain/transaction";

export function TransactionBadge({ type }: { type: TransactionType }) {
  const meta = transactionMeta[type];
  const colors: Record<string, "success" | "error" | "secondary" | "warning"> = {
    production: "success",
    sale: "error",
    return: "secondary",
    adjustment: "warning",
  };
  return (
    <Chip label={meta.label} color={colors[meta.token]} size="small" sx={{ fontWeight: 800 }} />
  );
}
