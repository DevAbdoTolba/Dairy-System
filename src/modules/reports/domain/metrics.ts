import type { InventoryTransaction } from "@/modules/transactions/domain/transaction";

export function percentageOrDash(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function calculateMetrics(
  transactions: Pick<InventoryTransaction, "type" | "quantity" | "status">[],
) {
  const totals = { production: 0, sales: 0, returns: 0, adjustmentIn: 0, adjustmentOut: 0 };
  for (const transaction of transactions) {
    if (transaction.status !== "ACTIVE") continue;
    if (transaction.type === "PRODUCTION") totals.production += transaction.quantity;
    if (transaction.type === "SALE") totals.sales += transaction.quantity;
    if (transaction.type === "RETURN") totals.returns += transaction.quantity;
    if (transaction.type === "ADJUSTMENT_IN") totals.adjustmentIn += transaction.quantity;
    if (transaction.type === "ADJUSTMENT_OUT") totals.adjustmentOut += transaction.quantity;
  }
  return {
    ...totals,
    sellThrough: percentageOrDash(totals.sales, totals.production),
    returnRate: percentageOrDash(totals.returns, totals.sales),
  };
}
