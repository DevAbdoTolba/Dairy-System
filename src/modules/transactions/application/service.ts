import crypto from "node:crypto";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { withMongoTransaction } from "@/shared/db";
import { isIsoDate } from "@/shared/dates/business-date";
import {
  findTransactionByIdempotencyKey,
  getTransaction,
  getVariant,
  insertTransaction,
  reserveStockChange,
  voidTransaction,
} from "@/modules/inventory";
import {
  transactionTypes,
  type InventoryTransaction,
  type TransactionType,
} from "../domain/transaction";

const transactionSchema = z.object({
  productVariantId: z.string().min(1),
  type: z.enum(transactionTypes),
  quantity: z.number().int().positive().max(100000),
  businessDate: z.string().refine(isIsoDate, "التاريخ غير صحيح"),
  note: z.string().trim().max(500).optional().default(""),
  allowNegative: z.boolean().optional().default(false),
  overrideReason: z.string().trim().max(500).optional().default(""),
  idempotencyKey: z.string().uuid(),
  reversesTransactionId: z.string().uuid().optional(),
});

export type CreateTransactionInput = z.input<typeof transactionSchema>;

export class BusinessRuleError extends Error {}

function lowersStock(type: TransactionType) {
  return type === "SALE" || type === "ADJUSTMENT_OUT";
}

export async function createTransaction(rawInput: CreateTransactionInput) {
  const input = transactionSchema.parse(rawInput);
  try {
    return await withMongoTransaction(async (session) => {
      const existing = await findTransactionByIdempotencyKey(input.idempotencyKey, { session });
      if (existing) return { transaction: existing, duplicate: true };
      if (!(await getVariant(input.productVariantId, { session })))
        throw new BusinessRuleError("فئة الوزن غير موجودة.");
      if (input.allowNegative && !input.overrideReason)
        throw new BusinessRuleError("سبب التجاوز مطلوب عند السماح برصيد سالب.");

      const transaction: InventoryTransaction = {
        id: crypto.randomUUID(),
        productVariantId: input.productVariantId,
        type: input.type,
        quantity: input.quantity,
        businessDate: input.businessDate,
        note: input.note || null,
        overrideReason: input.overrideReason || null,
        status: "ACTIVE",
        reversesTransactionId: input.reversesTransactionId ?? null,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date().toISOString(),
        voidedAt: null,
      };
      const accepted = await reserveStockChange(transaction, input.allowNegative, { session });
      if (lowersStock(input.type) && !accepted)
        throw new BusinessRuleError("لا يمكن أن يصبح الرصيد سالباً.");
      await insertTransaction(transaction, { session });
      return { transaction, duplicate: false };
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await findTransactionByIdempotencyKey(input.idempotencyKey);
      if (existing) return { transaction: existing, duplicate: true };
    }
    throw error;
  }
}

export async function undoTransaction(id: string) {
  await withMongoTransaction(async (session) => {
    const transaction = await getTransaction(id, { session });
    if (!transaction) throw new BusinessRuleError("الحركة غير موجودة.");
    if (transaction.status === "VOIDED") throw new BusinessRuleError("تم إلغاء هذه الحركة بالفعل.");
    if (!(await voidTransaction(id, { session })))
      throw new BusinessRuleError("تعذر إلغاء الحركة.");
  });
}

export async function correctTransaction(
  id: string,
  replacement: Omit<CreateTransactionInput, "reversesTransactionId">,
) {
  const original = await getTransaction(id);
  if (!original || original.status !== "ACTIVE")
    throw new BusinessRuleError("لا يمكن تصحيح هذه الحركة.");
  await undoTransaction(id);
  return createTransaction({ ...replacement, reversesTransactionId: id });
}
