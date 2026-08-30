import crypto from "node:crypto";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import type { Role } from "@/modules/auth/domain/role";
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
  closeSupplierShift,
  getAccountMovement,
  getMilkEntry,
  getResolvedShift,
  getSupplier,
  insertAccountMovement,
  insertMilkEntry,
  insertShift,
  softDeleteMilkEntry,
  reconcileMilkEntryFromCloseSnapshot,
  upsertShiftAlias,
  updateMilkEntryQuantity,
} from "../infrastructure/repository";
import { withSupplierCommand } from "./command-service";
import { canonicalJson, type ShiftCloseSnapshot } from "../domain/snapshot";
import type { SupplierAccountMovement } from "../domain/account-ledger";
import { enqueueBackupJob } from "@/shared/backup/backup-job-store";

const commandSchema = z.object({ commandId: z.string().uuid() });
const shiftInputSchema = commandSchema.extend({
  shiftId: z.string().uuid(),
  businessDate: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
  type: z.enum(shiftTypes),
});
const createMilkSchema = commandSchema.extend({
  entryId: z.string().uuid(),
  supplierId: z.string().uuid(),
  milkType: z.enum(milkTypes),
  quantityQuarterCupUnits: z.number().int().positive().max(1_000_000),
});
const reviseMilkSchema = commandSchema.extend({
  expectedRevision: z.number().int().positive(),
  quantityQuarterCupUnits: z.number().int().positive().max(1_000_000),
});
const deleteMilkSchema = commandSchema.extend({ expectedRevision: z.number().int().positive() });
const closeShiftSchema = commandSchema.extend({
  snapshot: z.object({
    payload: z.object({
      version: z.literal(1),
      shift: z.object({
        id: z.string().uuid(),
        businessDate: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
        type: z.enum(shiftTypes),
      }),
      entries: z.array(
        z.object({
          id: z.string().uuid(),
          supplierId: z.string().uuid(),
          milkType: z.enum(milkTypes),
          quantityQuarterCupUnits: z.number().int().positive(),
          revision: z.number().int().positive(),
          createdAt: z.string().datetime().optional(),
          updatedAt: z.string().datetime().optional(),
          deletedAt: z.string().datetime().nullable(),
        }),
      ),
      cashRecordIds: z.array(z.string().uuid()).default([]),
      cashRecords: z
        .array(
          z.object({
            id: z.string().uuid(),
            supplierId: z.string().uuid(),
            // Old downloaded snapshots did not include a milk type. Keep them
            // recoverable in the cow account instead of duplicating cash.
            milkType: z.enum(milkTypes).optional().default("COW"),
            amountPiasters: z.number().int().positive(),
            note: z.string().max(500),
            createdAt: z.string().datetime(),
          }),
        )
        .optional(),
      closedAt: z.string().datetime(),
    }),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export type OpenShiftInput = z.input<typeof shiftInputSchema>;
export type CreateMilkInput = z.input<typeof createMilkSchema>;
export type ReviseMilkInput = z.input<typeof reviseMilkSchema>;
export type DeleteMilkInput = z.input<typeof deleteMilkSchema>;
export type CloseShiftInput = z.input<typeof closeShiftSchema>;

export async function openSupplierShift(rawInput: OpenShiftInput, actorRole: Role) {
  const input = shiftInputSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "SHIFT_OPENED",
    "SHIFT",
    `${input.businessDate}:${input.type}`,
    actorRole,
    async (session) => {
      const existing = await findShiftByBusinessDate(input.businessDate, input.type, { session });
      if (existing) {
        if (existing.id !== input.shiftId)
          await upsertShiftAlias(input.shiftId, existing.id, { session });
        return { shift: existing };
      }
      const timestamp = new Date().toISOString();
      const shift: SupplierShift = {
        id: input.shiftId,
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
  const result = await withSupplierCommand(
    input.commandId,
    "MILK_ADDED",
    "MILK_ENTRY",
    input.commandId,
    actorRole,
    async (session) => {
      const [shift, supplier] = await Promise.all([
        getResolvedShift(shiftId, { session }),
        getSupplier(input.supplierId, { session }),
      ]);
      if (!shift) throw new SupplierBusinessRuleError("الوردية غير موجودة.");
      assertOpenShift(shift);
      if (!supplier?.active) throw new SupplierBusinessRuleError("المورد غير متاح للتسجيل.");
      if (!supplier.milkTypes.includes(input.milkType))
        throw new SupplierBusinessRuleError("نوع اللبن غير مسجل لهذا المورد.");
      const timestamp = new Date().toISOString();
      const entry: MilkEntry = {
        id: input.entryId,
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
        settlementId: null,
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
  const result = await withSupplierCommand(
    input.commandId,
    "MILK_REVISED",
    "MILK_ENTRY",
    entryId,
    actorRole,
    async (session) => {
      const [shift, entry] = await Promise.all([
        getResolvedShift(shiftId, { session }),
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
  const result = await withSupplierCommand(
    input.commandId,
    "MILK_DELETED",
    "MILK_ENTRY",
    entryId,
    actorRole,
    async (session) => {
      const [shift, entry] = await Promise.all([
        getResolvedShift(shiftId, { session }),
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

function snapshotChecksum(snapshot: ShiftCloseSnapshot) {
  return crypto.createHash("sha256").update(canonicalJson(snapshot.payload)).digest("hex");
}

async function reconcileSnapshotBeforeClose(
  shiftId: string,
  snapshot: ShiftCloseSnapshot,
  actorRole: Role,
  session: ClientSession,
) {
  const payload = snapshot.payload;
  let shift = await getResolvedShift(shiftId, { session });
  if (!shift) {
    const matchingShift = await findShiftByBusinessDate(
      payload.shift.businessDate,
      payload.shift.type,
      {
        session,
      },
    );
    if (matchingShift) {
      await upsertShiftAlias(shiftId, matchingShift.id, { session });
      shift = matchingShift;
    } else {
      shift = {
        id: shiftId,
        businessDate: payload.shift.businessDate,
        type: payload.shift.type,
        status: "OPEN",
        openedAt: payload.closedAt,
        closedAt: null,
        closedByRole: null,
        snapshotHash: null,
      };
      await insertShift(shift, { session });
    }
  }
  if (
    shift.businessDate !== payload.shift.businessDate ||
    shift.type !== payload.shift.type ||
    (shift.status === "CLOSED" && shift.snapshotHash !== snapshot.checksum)
  )
    throw new SupplierBusinessRuleError("لقطة الإغلاق لا تطابق الوردية المحفوظة.");
  if (shift.status === "CLOSED") return shift;

  for (const snapshotEntry of payload.entries) {
    if (!(await getSupplier(snapshotEntry.supplierId, { session })))
      throw new SupplierBusinessRuleError("لا يمكن استرجاع حركة لمورد غير موجود.");
    const entry: MilkEntry = {
      id: snapshotEntry.id,
      shiftId: shift.id,
      supplierId: snapshotEntry.supplierId,
      milkType: snapshotEntry.milkType,
      quantityQuarterCupUnits: snapshotEntry.quantityQuarterCupUnits,
      businessDate: shift.businessDate,
      sourceRole: actorRole,
      revision: snapshotEntry.revision,
      createdAt: snapshotEntry.createdAt ?? payload.closedAt,
      updatedAt: snapshotEntry.updatedAt ?? snapshotEntry.deletedAt ?? payload.closedAt,
      deletedAt: snapshotEntry.deletedAt,
      settlementId: null,
    };
    if (!(await reconcileMilkEntryFromCloseSnapshot(entry, { session })))
      throw new SupplierBusinessRuleError("تعارضت حركة اللبن مع نسخة إغلاق أخرى. راجع المالك.");
  }

  const recoveryCash = new Map((payload.cashRecords ?? []).map((record) => [record.id, record]));
  const cashIds = new Set([...payload.cashRecordIds, ...recoveryCash.keys()]);
  for (const cashId of cashIds) {
    const existing = await getAccountMovement(cashId, { session });
    const recovery = recoveryCash.get(cashId);
    if (existing) {
      if (
        existing.shiftId !== shift.id ||
        existing.type !== "POS_CASH_OUT" ||
        (recovery &&
          (existing.supplierId !== recovery.supplierId ||
            existing.milkType !== recovery.milkType ||
            existing.amountPiasters !== recovery.amountPiasters))
      )
        throw new SupplierBusinessRuleError("تعارضت حركة النقد مع نسخة إغلاق أخرى. راجع المالك.");
      continue;
    }
    if (!recovery)
      throw new SupplierBusinessRuleError("لقطة الإغلاق لا تحتوي على بيانات استرجاع حركة النقد.");
    if (!(await getSupplier(recovery.supplierId, { session })))
      throw new SupplierBusinessRuleError("لا يمكن استرجاع نقد لمورد غير موجود.");
    const movement: SupplierAccountMovement = {
      id: recovery.id,
      supplierId: recovery.supplierId,
      milkType: recovery.milkType,
      type: "POS_CASH_OUT",
      amountPiasters: recovery.amountPiasters,
      businessDate: shift.businessDate,
      shiftId: shift.id,
      sourceRole: actorRole,
      ownerReviewStatus: actorRole === "POS" ? "PENDING" : "NOT_REQUIRED",
      note: recovery.note || null,
      settlementId: null,
      createdAt: recovery.createdAt,
    };
    await insertAccountMovement(movement, { session });
  }
  return shift;
}

export async function closeSupplierShiftWithSnapshot(
  shiftId: string,
  rawInput: CloseShiftInput,
  actorRole: Role,
) {
  const input = closeShiftSchema.parse(rawInput);
  if (input.snapshot.payload.shift.id !== shiftId)
    throw new SupplierBusinessRuleError("لقطة الإغلاق لا تطابق الوردية.");
  if (snapshotChecksum(input.snapshot) !== input.snapshot.checksum)
    throw new SupplierBusinessRuleError("فشل التحقق من بصمة لقطة الإغلاق.");
  const result = await withSupplierCommand(
    input.commandId,
    "SHIFT_CLOSED",
    "SHIFT",
    shiftId,
    actorRole,
    async (session) => {
      const shift = await reconcileSnapshotBeforeClose(shiftId, input.snapshot, actorRole, session);
      if (!shift) throw new SupplierBusinessRuleError("الوردية غير موجودة.");
      if (
        shift.businessDate !== input.snapshot.payload.shift.businessDate ||
        shift.type !== input.snapshot.payload.shift.type
      )
        throw new SupplierBusinessRuleError("لقطة الإغلاق لا تطابق تاريخ أو نوع الوردية.");
      if (shift.status === "CLOSED") {
        if (shift.snapshotHash !== input.snapshot.checksum)
          throw new SupplierBusinessRuleError("الوردية مغلقة بلقطة مختلفة.");
        return { shift };
      }
      const closed = await closeSupplierShift(shiftId, input.snapshot.checksum, actorRole, {
        session,
      });
      if (!closed) throw new SupplierBusinessRuleError("تعذر إغلاق الوردية.");
      await enqueueBackupJob(
        {
          kind: "SHIFT_SNAPSHOT",
          artifactId: closed.id,
          filename: `dairy-shift-${closed.businessDate}-${closed.id}.json`,
          content: JSON.stringify(input.snapshot),
        },
        { session },
      );
      return { shift: closed };
    },
  );
  return { shift: result.value.shift, duplicate: result.duplicate };
}
