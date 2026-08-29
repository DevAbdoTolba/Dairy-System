import { describe, expect, it } from "vitest";
import {
  createQueuedTransaction,
  pendingMetric,
  pendingStockChange,
  type OfflineTransactionInput,
} from "./offline-queue";

function payload(overrides: Partial<OfflineTransactionInput> = {}): OfflineTransactionInput {
  return {
    productVariantId: "weight-5",
    type: "PRODUCTION",
    quantity: 3,
    businessDate: "2026-08-29",
    note: "",
    allowNegative: false,
    overrideReason: "",
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

describe("offline transaction projection", () => {
  it("projects pending operations in creation order without counting failed entries", () => {
    const production = createQueuedTransaction(payload(), "2026-08-29T08:00:00.000Z");
    const sale = createQueuedTransaction(
      payload({ type: "SALE", quantity: 2 }),
      "2026-08-29T09:00:00.000Z",
    );
    const failedReturn = {
      ...createQueuedTransaction(payload({ type: "RETURN", quantity: 10 })),
      state: "failed" as const,
      lastError: "rejected",
    };

    expect(pendingStockChange([production, sale, failedReturn], "weight-5")).toBe(1);
  });

  it("adds only matching transaction types and business dates to daily metrics", () => {
    const today = createQueuedTransaction(payload({ type: "SALE", quantity: 4 }));
    const yesterday = createQueuedTransaction(
      payload({ type: "SALE", quantity: 9, businessDate: "2026-08-28" }),
    );

    expect(pendingMetric([today, yesterday], "SALE", "2026-08-29")).toBe(4);
    expect(pendingMetric([today, yesterday], "RETURN", "2026-08-29")).toBe(0);
  });
});
