export const transactionTypes = [
  "PRODUCTION",
  "SALE",
  "RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const;

export type TransactionType = (typeof transactionTypes)[number];
export type TransactionStatus = "ACTIVE" | "VOIDED";

export type InventoryTransaction = {
  id: string;
  productVariantId: string;
  type: TransactionType;
  quantity: number;
  businessDate: string;
  note: string | null;
  overrideReason: string | null;
  status: TransactionStatus;
  reversesTransactionId: string | null;
  idempotencyKey: string;
  createdAt: string;
  voidedAt: string | null;
};

export const transactionMeta: Record<
  TransactionType,
  { label: string; shortLabel: string; token: string; stockDirection: 1 | -1 }
> = {
  PRODUCTION: { label: "تصنيع", shortLabel: "تصنيع", token: "production", stockDirection: 1 },
  SALE: { label: "بيع", shortLabel: "بيع", token: "sale", stockDirection: -1 },
  RETURN: { label: "مرتجع", shortLabel: "مرتجع", token: "return", stockDirection: 1 },
  ADJUSTMENT_IN: {
    label: "تسوية بالزيادة",
    shortLabel: "زيادة",
    token: "adjustment",
    stockDirection: 1,
  },
  ADJUSTMENT_OUT: {
    label: "تسوية بالنقص",
    shortLabel: "نقص",
    token: "adjustment",
    stockDirection: -1,
  },
};

export function stockDelta(type: TransactionType, quantity: number) {
  return transactionMeta[type].stockDirection * quantity;
}

export function calculateStock(
  transactions: Pick<InventoryTransaction, "type" | "quantity" | "status">[],
) {
  return transactions.reduce(
    (total, transaction) =>
      transaction.status === "ACTIVE"
        ? total + stockDelta(transaction.type, transaction.quantity)
        : total,
    0,
  );
}
