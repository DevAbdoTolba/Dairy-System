import crypto from "node:crypto";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import type { Role } from "@/modules/auth/domain/role";
import { withMongoTransaction } from "@/shared/db";
import { isIsoDate } from "@/shared/dates/business-date";
import {
  milkTypes,
  shiftTypes,
  assertOpenShift,
  SupplierBusinessRuleError,
  type MilkEntry,
  type SupplierShift,
} from "../domain/shift";
import {
  findShiftByBusinessDate,
  getMilkEntry,
  getShift,
  getSupplier,
  getSupplierEvent,
  insertMilkEntry,
  insertShift,
  insertSupplierEvent,
  softDeleteMilkEntry,
  updateMilkEntryQuantity,
} from "../infrastructure/repository";

const commandSchema = z.object({ commandId: z.string().uuid() });
const shiftInputSchema = commandSchema.extend({
  businessDate: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
  type: z.enum(shiftTypes),
});
const createMilkSchema = commandSchema.extend({
  supplierId: z.string().uuid(),
  milkType: z.enum(milkTypes),
  quantityQuarterCupUnits: z.number().int().positive().max(1_000_000),
});
const reviseMilkSchema = commandSchema.extend({
  expectedRevision: z.number().int().positive(),
  quantityQuarterCupUnits: z.number().int().positive().max(1_000_000),
});
const deleteMilkSchema = commandSchema.extend({ expectedRevision: z.number().int().positive() });

export type OpenShiftInput = z.input<typeof shiftInputSchema>;
export type CreateMilkInput = z.input<typeof createMilkSchema>;
export type ReviseMilkInput = z.input<typeof reviseMilkSchema>;
export type DeleteMilkInput = z.input<typeof deleteMilkSchema>;

async function withCommand<T>(
  commandId: string,
  kind: string,
  aggregateType: "SUPPLIER" | "SHIFT" | "MILK_ENTRY",
  aggregateId: string,
  actorRole: Role,
  operation: (session: Parameters<Parameters<typeof withMongoTransaction>[0]>[0]) => Promise<T>,
) {
  const existing = await getSupplierEvent(commandId);
  if (existing) return { value: existing.result as T, duplicate: true };
  try {
    return await withMongoTransaction(async (session) => {
      const repeated = await getSupplierEvent(commandId, { session });
      if (repeated) return { value: repeated.result as T, duplicate: true };
      const value = await operation(session);
      await insertSupplierEvent(
        {
          _id: commandId,
          kind,
          aggregateType,
          aggregateId,
          actorRole,
          result: value,
          createdAt: new Date().toISOString(),
        },
        { session },
      );
      return { value, duplicate: false };
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const repeated = await getSupplierEvent(commandId);
      if (repeated) return { value: repeated.result as T, duplicate: true };
    }
    throw error;
  }
}

export async function openSupplierShift(rawInput: OpenShiftInput, actorRole: Role) {
  const input = shiftInputSchema.parse(rawInput);
  const known = await findShiftByBusinessDate(input.businessDate, input.type);
  if (known) return { shift: known, duplicate: true };
  const result = await withCommand(
    input.commandId,
    "SHIFT_OPENED",
    "SHIFT",
    `${input.businessDate}:${input.type}`,
    actorRole,
    async (session) => {
      const existing = await findShiftByBusinessDate(input.businessDate, input.type, { session });
      if (existing) return { shift: existing };
      const timestamp = new Date().toISOString();
      const shift: SupplierShift = {
        id: crypto.randomUUID(),
        businessDate: input.businessDate,
        type: input.type,
        status: "OPEN",
        openedAt: timestamp,
        closedAt: null,
        closedByRole: null,
        snapshotHash: null,
      };
      await insertShift(shift, { session });
      return { shift };
    },
  );
  return { shift: result.value.shift, duplicate: result.duplicate };
}

export async function addMilkEntry(shiftId: string, rawInput: CreateMilkInput, actorRole: Role) {
  const input = createMilkSchema.parse(rawInput);
  const result = await withCommand(
    input.commandId,
    "MILK_ADDED",
    "MILK_ENTRY",
    input.commandId,
    actorRole,
    async (session) => {
      const [shift, supplier] = await Promise.all([
        getShift(shiftId, { session }),
        getSupplier(input.supplierId, { session }),
      ]);
      if (!shift) throw new SupplierBusinessRuleError("الوردية غير موجودة.");
      assertOpenShift(shift);
      if (!supplier?.active) throw new SupplierBusinessRuleError("المورد غير متاح للتسجيل.");
      const timestamp = new Date().toISOString();
      const entry: MilkEntry = {
        id: crypto.randomUUID(),
        shiftId,
        supplierId: input.supplierId,
        milkType: input.milkType,
        quantityQuarterCupUnits: input.quantityQuarterCupUnits,
        businessDate: shift.businessDate,
        sourceRole: actorRole,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      await insertMilkEntry(entry, { session });
      return { entry };
    },
  );
  return { entry: result.value.entry, duplicate: result.duplicate };
}

export async function reviseMilkEntry(
  shiftId: string,
  entryId: string,
  rawInput: ReviseMilkInput,
  actorRole: Role,
) {
  const input = reviseMilkSchema.parse(rawInput);
  const result = await withCommand(
    input.commandId,
    "MILK_REVISED",
    "MILK_ENTRY",
    entryId,
    actorRole,
    async (session) => {
      const [shift, entry] = await Promise.all([
        getShift(shiftId, { session }),
        getMilkEntry(entryId, { session }),
      ]);
      if (!shift || !entry || entry.shiftId !== shiftId)
        throw new SupplierBusinessRuleError("حركة اللبن غير موجودة.");
      assertOpenShift(shift);
      const revised = await updateMilkEntryQuantity(
        entryId,
        input.expectedRevision,
        input.quantityQuarterCupUnits,
        new Date().toISOString(),
        { session },
      );
      if (!revised)
        throw new SupplierBusinessRuleError(
          "تم تعديل الحركة في مكان آخر. حدّث الشاشة ثم أعد المحاولة.",
        );
      return { entry: revised };
    },
  );
  return { entry: result.value.entry, duplicate: result.duplicate };
}

export async function deleteMilkEntry(
  shiftId: string,
  entryId: string,
  rawInput: DeleteMilkInput,
  actorRole: Role,
) {
  const input = deleteMilkSchema.parse(rawInput);
  const result = await withCommand(
    input.commandId,
    "MILK_DELETED",
    "MILK_ENTRY",
    entryId,
    actorRole,
    async (session) => {
      const [shift, entry] = await Promise.all([
        getShift(shiftId, { session }),
        getMilkEntry(entryId, { session }),
      ]);
      if (!shift || !entry || entry.shiftId !== shiftId)
        throw new SupplierBusinessRuleError("حركة اللبن غير موجودة.");
      assertOpenShift(shift);
      const deleted = await softDeleteMilkEntry(
        entryId,
        input.expectedRevision,
        new Date().toISOString(),
        { session },
      );
      if (!deleted)
        throw new SupplierBusinessRuleError(
          "تم تعديل الحركة في مكان آخر. حدّث الشاشة ثم أعد المحاولة.",
        );
      return { entry: deleted };
    },
  );
  return { entry: result.value.entry, duplicate: result.duplicate };
}
