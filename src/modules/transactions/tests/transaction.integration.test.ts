import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describeMongo("MongoDB transaction repository", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("initializes data, persists movements, and rejects negative sales", async () => {
    const { listActiveVariants, getCurrentStock } = await import("@/modules/inventory");
    const { createTransaction, BusinessRuleError } = await import("../application/service");
    const variant = (await listActiveVariants())[0];
    expect(variant.weightKg).toBe(5);
    await createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 3,
      businessDate: "2026-08-28",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(await getCurrentStock(variant.id)).toBe(3);
    await expect(
      createTransaction({
        productVariantId: variant.id,
        type: "SALE",
        quantity: 4,
        businessDate: "2026-08-28",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("uses an idempotency key and supports ledger voiding", async () => {
    const { listActiveVariants, getCurrentStock } = await import("@/modules/inventory");
    const { createTransaction, undoTransaction } = await import("../application/service");
    const variant = (await listActiveVariants())[0];
    const idempotencyKey = crypto.randomUUID();
    const first = await createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 2,
      businessDate: "2026-08-28",
      idempotencyKey,
    });
    const duplicate = await createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 2,
      businessDate: "2026-08-28",
      idempotencyKey,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(await getCurrentStock(variant.id)).toBe(2);
    await undoTransaction(first.transaction.id);
    expect(await getCurrentStock(variant.id)).toBe(0);
  });
});
