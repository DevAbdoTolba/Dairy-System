import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tempDir = "";
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dairy-test-"));
  process.env.DAIRY_DATABASE_PATH = path.join(tempDir, "dairy.sqlite");
});
afterEach(async () => {
  const db = await import("@/shared/db");
  db.closeDatabaseForTests();
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DAIRY_DATABASE_PATH;
});
describe("SQLite transaction repository", () => {
  it("migrates an empty database, persists movements and rejects negative sales", async () => {
    const { listActiveVariants, getCurrentStock } =
      await import("@/modules/inventory/infrastructure/repository");
    const { createTransaction, BusinessRuleError } = await import("../application/service");
    const variant = listActiveVariants()[0];
    expect(variant.weightKg).toBe(5);
    createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 3,
      businessDate: "2026-08-28",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(getCurrentStock(variant.id)).toBe(3);
    expect(() =>
      createTransaction({
        productVariantId: variant.id,
        type: "SALE",
        quantity: 4,
        businessDate: "2026-08-28",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).toThrow(BusinessRuleError);
  });
  it("uses an idempotency key and supports ledger voiding", async () => {
    const { listActiveVariants, getCurrentStock } =
      await import("@/modules/inventory/infrastructure/repository");
    const { createTransaction, undoTransaction } = await import("../application/service");
    const variant = listActiveVariants()[0];
    const idempotencyKey = crypto.randomUUID();
    const first = createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 2,
      businessDate: "2026-08-28",
      idempotencyKey,
    });
    const duplicate = createTransaction({
      productVariantId: variant.id,
      type: "PRODUCTION",
      quantity: 2,
      businessDate: "2026-08-28",
      idempotencyKey,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(getCurrentStock(variant.id)).toBe(2);
    undoTransaction(first.transaction.id);
    expect(getCurrentStock(variant.id)).toBe(0);
  });
});
