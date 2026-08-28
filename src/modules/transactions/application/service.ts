import crypto from "node:crypto";
import { z } from "zod";
import { getSqlite } from "@/shared/db";
import { isIsoDate } from "@/shared/dates/business-date";
import {
  findTransactionByIdempotencyKey,
  getCurrentStock,
  getTransaction,
  getVariant,
  insertTransaction,
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

export function createTransaction(rawInput: CreateTransactionInput) {
  const input = transactionSchema.parse(rawInput);
  return getSqlite().transaction(() => {
    const existing = findTransactionByIdempotencyKey(input.idempotencyKey);
    if (existing) return { transaction: existing, duplicate: true };
    if (!getVariant(input.productVariantId)) throw new BusinessRuleError("فئة الوزن غير موجودة.");
    const stock = getCurrentStock(input.productVariantId);
    if (lowersStock(input.type) && stock < input.quantity) {
      if (!input.allowNegative) throw new BusinessRuleError("لا يمكن أن يصبح الرصيد سالباً.");
      if (!input.overrideReason)
        throw new BusinessRuleError("سبب التجاوز مطلوب عند السماح برصيد سالب.");
    }
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
    insertTransaction(transaction);
    return { transaction, duplicate: false };
  })();
}

export function undoTransaction(id: string) {
  const transaction = getTransaction(id);
  if (!transaction) throw new BusinessRuleError("الحركة غير موجودة.");
  if (transaction.status === "VOIDED") throw new BusinessRuleError("تم إلغاء هذه الحركة بالفعل.");
  if (!voidTransaction(id)) throw new BusinessRuleError("تعذر إلغاء الحركة.");
}

export function correctTransaction(
  id: string,
  replacement: Omit<CreateTransactionInput, "reversesTransactionId">,
) {
  const original = getTransaction(id);
  if (!original || original.status !== "ACTIVE")
    throw new BusinessRuleError("لا يمكن تصحيح هذه الحركة.");
  return getSqlite().transaction(() => {
    undoTransaction(id);
    return createTransaction({ ...replacement, reversesTransactionId: id });
  })();
}
