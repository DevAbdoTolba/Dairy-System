import crypto from "node:crypto";
import { createTransaction } from "../src/modules/transactions/application/service";
import { listActiveVariants } from "../src/modules/inventory";

if (process.env.NODE_ENV === "production")
  throw new Error("The deterministic seed command is disabled in production.");

const variants = await listActiveVariants();
for (const [index, variant] of variants.entries()) {
  await createTransaction({
    productVariantId: variant.id,
    type: "PRODUCTION",
    quantity: 20 + index * 2,
    businessDate: "2026-08-01",
    note: "بيانات تجريبية",
    idempotencyKey: crypto.randomUUID(),
  });
  await createTransaction({
    productVariantId: variant.id,
    type: "SALE",
    quantity: 7 + index,
    businessDate: "2026-08-05",
    note: "بيانات تجريبية",
    idempotencyKey: crypto.randomUUID(),
  });
  await createTransaction({
    productVariantId: variant.id,
    type: "RETURN",
    quantity: 1,
    businessDate: "2026-08-09",
    note: "بيانات تجريبية",
    idempotencyKey: crypto.randomUUID(),
  });
}
console.log("Development demonstration data added.");
