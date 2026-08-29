import { stockDelta, type TransactionType } from "@/modules/transactions/domain/transaction";

export const OFFLINE_DATABASE_NAME = "dairy-offline";
export const OFFLINE_DATABASE_VERSION = 1;
export const OFFLINE_TRANSACTION_STORE = "transactions";
export const OFFLINE_QUEUE_EVENT = "dairy-outbox-change";

export type OfflineTransactionInput = {
  productVariantId: string;
  type: TransactionType;
  quantity: number;
  businessDate: string;
  note: string;
  allowNegative: boolean;
  overrideReason: string;
  idempotencyKey: string;
};

export type QueuedTransaction = {
  idempotencyKey: string;
  endpoint: "/api/transactions";
  method: "POST";
  payload: OfflineTransactionInput;
  createdAt: string;
  attempts: number;
  state: "pending" | "failed";
  lastError: string | null;
};

export function createQueuedTransaction(
  payload: OfflineTransactionInput,
  createdAt = new Date().toISOString(),
): QueuedTransaction {
  return {
    idempotencyKey: payload.idempotencyKey,
    endpoint: "/api/transactions",
    method: "POST",
    payload,
    createdAt,
    attempts: 0,
    state: "pending",
    lastError: null,
  };
}

export function pendingStockChange(entries: QueuedTransaction[], productVariantId: string) {
  return entries
    .filter(
      (entry) => entry.state === "pending" && entry.payload.productVariantId === productVariantId,
    )
    .reduce((total, entry) => total + stockDelta(entry.payload.type, entry.payload.quantity), 0);
}

export function pendingMetric(
  entries: QueuedTransaction[],
  type: "PRODUCTION" | "SALE" | "RETURN",
  businessDate: string,
) {
  return entries
    .filter(
      (entry) =>
        entry.state === "pending" &&
        entry.payload.type === type &&
        entry.payload.businessDate === businessDate,
    )
    .reduce((total, entry) => total + entry.payload.quantity, 0);
}
