import crypto from "node:crypto";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import type { Role } from "@/modules/auth/domain/role";
import { isIsoDate } from "@/shared/dates/business-date";
import {
  accountMovementTypes,
  accountTotalPiasters,
  type AccountMovementType,
  type SupplierAccountMovement,
  type SupplierRepaymentInstruction,
} from "../domain/account-ledger";
import { milkLineValuePiasters } from "../domain/money";
import { priceForDelivery, type MilkPricePeriod } from "../domain/price";
import { milkTypes, assertOpenShift, SupplierBusinessRuleError } from "../domain/shift";
import {
  getAccountMovement,
  getRepaymentInstruction,
  getResolvedShift,
  getSupplier,
  insertAccountMovement,
  listAccountMovements,
  listMilkEntriesForSupplier,
  listMilkPrices,
  listSuppliers,
  markAccountMovementReviewed,
  upsertMilkPrice,
  upsertRepaymentInstruction,
} from "../infrastructure/repository";
import { withSupplierCommand } from "./command-service";

const commandSchema = z.object({ commandId: z.string().uuid() });
const priceSchema = commandSchema.extend({
  milkType: z.enum(milkTypes),
  effectiveFrom: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
  pricePiastersPerSatl: z.number().int().positive().max(10_000_000),
});
const cashSchema = commandSchema.extend({
  movementId: z.string().uuid(),
  supplierId: z.string().uuid(),
  amountPiasters: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(500).optional().default(""),
});
const ownerMovementSchema = commandSchema.extend({
  movementId: z.string().uuid(),
  supplierId: z.string().uuid(),
  type: z.enum(["OWNER_CASH_OUT", "GOODS_CHARGE", "MANUAL_CREDIT", "MANUAL_DEBIT"]),
  amountPiasters: z.number().int().positive().max(100_000_000),
  businessDate: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
  note: z.string().trim().max(500).optional().default(""),
});
const reviewSchema = commandSchema.extend({ movementId: z.string().uuid() });
const repaymentInstructionSchema = commandSchema.extend({
  supplierId: z.string().uuid(),
  suggestedDeductionPiasters: z.number().int().min(0).max(100_000_000),
  holdPaymentUntil: z.string().refine(isIsoDate, "التاريخ غير صحيح.").nullable().optional(),
  note: z.string().trim().max(500).optional().default(""),
});

export type SetMilkPriceInput = z.input<typeof priceSchema>;
export type RecordShiftCashInput = z.input<typeof cashSchema>;
export type RecordOwnerMovementInput = z.input<typeof ownerMovementSchema>;
export type ReviewPosCashInput = z.input<typeof reviewSchema>;
export type SetRepaymentInstructionInput = z.input<typeof repaymentInstructionSchema>;

export type AccountMilkLine = {
  entryId: string;
  businessDate: string;
  milkType: "COW" | "BUFFALO";
  quantityQuarterCupUnits: number;
  price: MilkPricePeriod | null;
  valuePiasters: number | null;
};

function optionalNote(value: string) {
  return value || null;
}

async function assertActiveSupplier(supplierId: string, session?: ClientSession) {
  const supplier = await getSupplier(supplierId, { session });
  if (!supplier?.active) throw new SupplierBusinessRuleError("المورد غير متاح للتسجيل.");
  return supplier;
}

export async function setMilkPrice(rawInput: SetMilkPriceInput) {
  const input = priceSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "MILK_PRICE_SET",
    "PRICE",
    `${input.milkType}:${input.effectiveFrom}`,
    "OWNER",
    async (session) => {
      const timestamp = new Date().toISOString();
      const price = await upsertMilkPrice(
        {
          id: crypto.randomUUID(),
          milkType: input.milkType,
          effectiveFrom: input.effectiveFrom,
          pricePiastersPerSatl: input.pricePiastersPerSatl,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        { session },
      );
      return { price };
    },
  );
  return { price: result.value.price, duplicate: result.duplicate };
}

export async function recordShiftCash(
  shiftId: string,
  rawInput: RecordShiftCashInput,
  actorRole: Role,
) {
  const input = cashSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "SHIFT_CASH_RECORDED",
    "ACCOUNT_MOVEMENT",
    input.movementId,
    actorRole,
    async (session) => {
      const [shift] = await Promise.all([getResolvedShift(shiftId, { session })]);
      if (!shift) throw new SupplierBusinessRuleError("الوردية غير موجودة.");
      assertOpenShift(shift);
      await assertActiveSupplier(input.supplierId, session);
      const movement: SupplierAccountMovement = {
        id: input.movementId,
        supplierId: input.supplierId,
        type: "POS_CASH_OUT",
        amountPiasters: input.amountPiasters,
        businessDate: shift.businessDate,
        shiftId: shift.id,
        sourceRole: actorRole,
        ownerReviewStatus: actorRole === "POS" ? "PENDING" : "NOT_REQUIRED",
        note: optionalNote(input.note),
        settlementId: null,
        createdAt: new Date().toISOString(),
      };
      await insertAccountMovement(movement, { session });
      return { movement };
    },
  );
  return { movement: result.value.movement, duplicate: result.duplicate };
}

export async function recordOwnerMovement(rawInput: RecordOwnerMovementInput) {
  const input = ownerMovementSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "OWNER_ACCOUNT_MOVEMENT_RECORDED",
    "ACCOUNT_MOVEMENT",
    input.movementId,
    "OWNER",
    async (session) => {
      await assertActiveSupplier(input.supplierId, session);
      const movement: SupplierAccountMovement = {
        id: input.movementId,
        supplierId: input.supplierId,
        type: input.type as AccountMovementType,
        amountPiasters: input.amountPiasters,
        businessDate: input.businessDate,
        shiftId: null,
        sourceRole: "OWNER",
        ownerReviewStatus: "NOT_REQUIRED",
        note: optionalNote(input.note),
        settlementId: null,
        createdAt: new Date().toISOString(),
      };
      await insertAccountMovement(movement, { session });
      return { movement };
    },
  );
  return { movement: result.value.movement, duplicate: result.duplicate };
}

export async function reviewPosCash(rawInput: ReviewPosCashInput) {
  const input = reviewSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "POS_CASH_REVIEWED",
    "ACCOUNT_MOVEMENT",
    input.movementId,
    "OWNER",
    async (session) => {
      const movement = await getAccountMovement(input.movementId, { session });
      if (!movement || movement.type !== "POS_CASH_OUT")
        throw new SupplierBusinessRuleError("حركة النقد غير موجودة.");
      if (movement.ownerReviewStatus !== "PENDING") return { movement };
      const reviewed = await markAccountMovementReviewed(input.movementId, { session });
      if (!reviewed) throw new SupplierBusinessRuleError("تعذر اعتماد حركة النقد.");
      return { movement: reviewed };
    },
  );
  return { movement: result.value.movement, duplicate: result.duplicate };
}

export async function setRepaymentInstruction(rawInput: SetRepaymentInstructionInput) {
  const input = repaymentInstructionSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "REPAYMENT_ADVICE_SET",
    "SUPPLIER",
    input.supplierId,
    "OWNER",
    async (session) => {
      await assertActiveSupplier(input.supplierId, session);
      const instruction: SupplierRepaymentInstruction = {
        supplierId: input.supplierId,
        suggestedDeductionPiasters: input.suggestedDeductionPiasters,
        holdPaymentUntil: input.holdPaymentUntil ?? null,
        note: optionalNote(input.note),
        updatedAt: new Date().toISOString(),
      };
      await upsertRepaymentInstruction(instruction, { session });
      return { instruction };
    },
  );
  return { instruction: result.value.instruction, duplicate: result.duplicate };
}

export async function listPricePeriods() {
  return listMilkPrices();
}

export async function listPendingPosCash() {
  return listAccountMovements({ ownerReviewStatus: "PENDING" });
}

export async function getSupplierAccount(supplierId: string) {
  const [supplier, entries, movements, prices, instruction] = await Promise.all([
    getSupplier(supplierId),
    listMilkEntriesForSupplier(supplierId),
    listAccountMovements({ supplierId }),
    listMilkPrices(),
    getRepaymentInstruction(supplierId),
  ]);
  if (!supplier) throw new SupplierBusinessRuleError("المورد غير موجود.");
  const milkLines: AccountMilkLine[] = entries
    .filter((entry) => !entry.deletedAt)
    .map((entry) => {
      const price = priceForDelivery(prices, entry.milkType, entry.businessDate);
      return {
        entryId: entry.id,
        businessDate: entry.businessDate,
        milkType: entry.milkType,
        quantityQuarterCupUnits: entry.quantityQuarterCupUnits,
        price: price ?? null,
        valuePiasters: price
          ? milkLineValuePiasters(entry.quantityQuarterCupUnits, price.pricePiastersPerSatl)
          : null,
      };
    });
  const pricedMilkPiasters = milkLines.reduce(
    (total, line) => total + (line.valuePiasters ?? 0),
    0,
  );
  const unpricedMilkLines = milkLines.filter((line) => line.valuePiasters === null).length;
  return {
    supplier,
    movements,
    milkLines,
    instruction: instruction ?? null,
    pricedMilkPiasters,
    movementPiasters: accountTotalPiasters(movements),
    balancePiasters: pricedMilkPiasters + accountTotalPiasters(movements),
    unpricedMilkLines,
  };
}

export async function listSupplierAccountSummaries() {
  const suppliers = await listSuppliers();
  return Promise.all(
    suppliers.map(async (supplier) => {
      const account = await getSupplierAccount(supplier.id);
      return {
        supplier: account.supplier,
        balancePiasters: account.balancePiasters,
        unpricedMilkLines: account.unpricedMilkLines,
        pendingReviewCount: account.movements.filter(
          (movement) => movement.ownerReviewStatus === "PENDING",
        ).length,
      };
    }),
  );
}

export { accountMovementTypes };
