import type { ClientSession, Filter } from "mongodb";
import { getDb } from "@/shared/db";
import type { Role } from "@/modules/auth/domain/role";
import type { MilkEntry, SupplierShift } from "../domain/shift";
import type { Supplier } from "../domain/supplier";
import type { SupplierVisit } from "../domain/prediction";
import type {
  SupplierAccountMovement,
  SupplierRepaymentInstruction,
} from "../domain/account-ledger";
import type { MilkPricePeriod } from "../domain/price";

type Options = { session?: ClientSession };

type SupplierDocument = Omit<Supplier, "id"> & { _id: string };
type SupplierShiftDocument = Omit<SupplierShift, "id"> & { _id: string };
type SupplierShiftAliasDocument = { _id: string; shiftId: string; createdAt: string };
type MilkEntryDocument = Omit<MilkEntry, "id"> & { _id: string };
type MilkPriceDocument = Omit<MilkPricePeriod, "id"> & { _id: string };
type AccountMovementDocument = Omit<SupplierAccountMovement, "id"> & { _id: string };
type RepaymentInstructionDocument = SupplierRepaymentInstruction & { _id: string };
type SupplierEventDocument = {
  _id: string;
  kind: string;
  aggregateType: "SUPPLIER" | "SHIFT" | "MILK_ENTRY" | "PRICE" | "ACCOUNT_MOVEMENT" | "SETTLEMENT";
  aggregateId: string;
  actorRole: Role;
  result: unknown;
  createdAt: string;
};

function asSupplier(document: SupplierDocument): Supplier {
  const { _id, ...supplier } = document;
  return { id: _id, ...supplier };
}

function asShift(document: SupplierShiftDocument): SupplierShift {
  const { _id, ...shift } = document;
  return { id: _id, ...shift };
}

function asMilkEntry(document: MilkEntryDocument): MilkEntry {
  const { _id, ...entry } = document;
  return { id: _id, ...entry };
}

function asMilkPrice(document: MilkPriceDocument): MilkPricePeriod {
  const { _id, ...price } = document;
  return { id: _id, ...price };
}

function asAccountMovement(document: AccountMovementDocument): SupplierAccountMovement {
  const { _id, ...movement } = document;
  return { id: _id, ...movement };
}

export async function listSuppliers(
  filters: { active?: boolean } = {},
  options: Options = {},
): Promise<Supplier[]> {
  const db = await getDb();
  const filter: Filter<SupplierDocument> = {};
  if (filters.active !== undefined) filter.active = filters.active;
  const suppliers = await db
    .collection<SupplierDocument>("suppliers")
    .find(filter, options)
    .sort({ sortOrder: 1, sortKey: 1, _id: 1 })
    .toArray();
  return suppliers.map(asSupplier);
}

export async function getSupplier(id: string, options: Options = {}) {
  const db = await getDb();
  const supplier = await db.collection<SupplierDocument>("suppliers").findOne({ _id: id }, options);
  return supplier ? asSupplier(supplier) : undefined;
}

export async function nextSupplierSortOrder(options: Options = {}) {
  const db = await getDb();
  const last = await db
    .collection<SupplierDocument>("suppliers")
    .find({}, options)
    .sort({ sortOrder: -1 })
    .limit(1)
    .next();
  return (last?.sortOrder ?? 0) + 1;
}

export async function insertSupplier(supplier: Supplier, options: Options = {}) {
  const db = await getDb();
  await db
    .collection<SupplierDocument>("suppliers")
    .insertOne({ _id: supplier.id, ...supplier }, options);
  return supplier;
}

export async function updateSupplier(
  id: string,
  update: Pick<
    Supplier,
    "displayName" | "nameTokens" | "sortKey" | "posInstruction" | "active" | "updatedAt"
  >,
  options: Options = {},
) {
  const db = await getDb();
  const result = await db
    .collection<SupplierDocument>("suppliers")
    .updateOne({ _id: id }, { $set: update }, options);
  if (result.modifiedCount !== 1) return undefined;
  return getSupplier(id, options);
}

export async function findShiftByBusinessDate(
  businessDate: string,
  type: SupplierShift["type"],
  options: Options = {},
) {
  const db = await getDb();
  const shift = await db
    .collection<SupplierShiftDocument>("supplierShifts")
    .findOne({ businessDate, type }, options);
  return shift ? asShift(shift) : undefined;
}

export async function getShift(id: string, options: Options = {}) {
  const db = await getDb();
  const shift = await db
    .collection<SupplierShiftDocument>("supplierShifts")
    .findOne({ _id: id }, options);
  return shift ? asShift(shift) : undefined;
}

export async function insertShift(shift: SupplierShift, options: Options = {}) {
  const db = await getDb();
  await db
    .collection<SupplierShiftDocument>("supplierShifts")
    .insertOne({ _id: shift.id, ...shift }, options);
  return shift;
}

export async function upsertShiftAlias(
  clientShiftId: string,
  shiftId: string,
  options: Options = {},
) {
  const db = await getDb();
  await db
    .collection<SupplierShiftAliasDocument>("supplierShiftAliases")
    .updateOne(
      { _id: clientShiftId },
      { $setOnInsert: { shiftId, createdAt: new Date().toISOString() } },
      { upsert: true, ...options },
    );
}

export async function getResolvedShift(id: string, options: Options = {}) {
  const direct = await getShift(id, options);
  if (direct) return direct;
  const db = await getDb();
  const alias = await db
    .collection<SupplierShiftAliasDocument>("supplierShiftAliases")
    .findOne({ _id: id }, options);
  return alias ? getShift(alias.shiftId, options) : undefined;
}

export async function listMilkEntries(
  shiftId: string,
  options: Options = {},
): Promise<MilkEntry[]> {
  const db = await getDb();
  const entries = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .find({ shiftId }, options)
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return entries.map(asMilkEntry);
}

export async function listMilkEntriesForSupplier(
  supplierId: string,
  options: Options = {},
): Promise<MilkEntry[]> {
  const db = await getDb();
  const entries = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .find({ supplierId }, options)
    .sort({ businessDate: 1, createdAt: 1, _id: 1 })
    .toArray();
  return entries.map(asMilkEntry);
}

export async function getMilkEntry(id: string, options: Options = {}) {
  const db = await getDb();
  const entry = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .findOne({ _id: id }, options);
  return entry ? asMilkEntry(entry) : undefined;
}

export async function insertMilkEntry(entry: MilkEntry, options: Options = {}) {
  const db = await getDb();
  await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .insertOne({ _id: entry.id, ...entry }, options);
  return entry;
}

export async function listSupplierVisits(options: Options = {}): Promise<SupplierVisit[]> {
  const db = await getDb();
  const visits = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .aggregate<{
      supplierId: string;
      shiftId: string;
      shiftType: SupplierShift["type"];
      businessDate: string;
      createdAt: string;
    }>(
      [
        { $match: { deletedAt: null } },
        {
          $lookup: {
            from: "supplierShifts",
            localField: "shiftId",
            foreignField: "_id",
            as: "shift",
          },
        },
        { $unwind: "$shift" },
        {
          $group: {
            _id: { supplierId: "$supplierId", shiftId: "$shiftId" },
            shiftType: { $first: "$shift.type" },
            businessDate: { $first: "$businessDate" },
            createdAt: { $min: "$createdAt" },
          },
        },
        {
          $project: {
            _id: 0,
            supplierId: "$_id.supplierId",
            shiftId: "$_id.shiftId",
            shiftType: 1,
            businessDate: 1,
            createdAt: 1,
          },
        },
      ],
      options,
    )
    .toArray();
  return visits;
}

export async function updateMilkEntryQuantity(
  id: string,
  expectedRevision: number,
  quantityQuarterCupUnits: number,
  updatedAt: string,
  options: Options = {},
) {
  const db = await getDb();
  const entries = db.collection<MilkEntryDocument>("supplierMilkEntries");
  const result = await entries.updateOne(
    { _id: id, revision: expectedRevision, deletedAt: null },
    { $set: { quantityQuarterCupUnits, updatedAt }, $inc: { revision: 1 } },
    options,
  );
  if (result.modifiedCount !== 1) return undefined;
  return getMilkEntry(id, options);
}

export async function softDeleteMilkEntry(
  id: string,
  expectedRevision: number,
  deletedAt: string,
  options: Options = {},
) {
  const db = await getDb();
  const entries = db.collection<MilkEntryDocument>("supplierMilkEntries");
  const result = await entries.updateOne(
    { _id: id, revision: expectedRevision, deletedAt: null },
    { $set: { deletedAt, updatedAt: deletedAt }, $inc: { revision: 1 } },
    options,
  );
  if (result.modifiedCount !== 1) return undefined;
  return getMilkEntry(id, options);
}

export async function getSupplierEvent(commandId: string, options: Options = {}) {
  const db = await getDb();
  return db
    .collection<SupplierEventDocument>("supplierEvents")
    .findOne({ _id: commandId }, options);
}

export async function insertSupplierEvent(event: SupplierEventDocument, options: Options = {}) {
  const db = await getDb();
  await db.collection<SupplierEventDocument>("supplierEvents").insertOne(event, options);
}

export async function listMilkPrices(options: Options = {}): Promise<MilkPricePeriod[]> {
  const db = await getDb();
  const prices = await db
    .collection<MilkPriceDocument>("supplierMilkPrices")
    .find({}, options)
    .sort({ milkType: 1, effectiveFrom: -1, _id: 1 })
    .toArray();
  return prices.map(asMilkPrice);
}

export async function upsertMilkPrice(price: MilkPricePeriod, options: Options = {}) {
  const db = await getDb();
  await db.collection<MilkPriceDocument>("supplierMilkPrices").updateOne(
    { milkType: price.milkType, effectiveFrom: price.effectiveFrom },
    {
      $set: {
        pricePiastersPerSatl: price.pricePiastersPerSatl,
        updatedAt: price.updatedAt,
      },
      $setOnInsert: {
        _id: price.id,
        milkType: price.milkType,
        effectiveFrom: price.effectiveFrom,
        createdAt: price.createdAt,
      },
    },
    { upsert: true, ...options },
  );
  const stored = await db
    .collection<MilkPriceDocument>("supplierMilkPrices")
    .findOne({ milkType: price.milkType, effectiveFrom: price.effectiveFrom }, options);
  if (!stored) throw new Error("Could not store the milk price.");
  return asMilkPrice(stored);
}

export async function getAccountMovement(id: string, options: Options = {}) {
  const db = await getDb();
  const movement = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .findOne({ _id: id }, options);
  return movement ? asAccountMovement(movement) : undefined;
}

export async function insertAccountMovement(
  movement: SupplierAccountMovement,
  options: Options = {},
) {
  const db = await getDb();
  await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .insertOne({ _id: movement.id, ...movement }, options);
  return movement;
}

export async function listAccountMovements(
  filters: {
    supplierId?: string;
    shiftId?: string;
    ownerReviewStatus?: SupplierAccountMovement["ownerReviewStatus"];
  } = {},
  options: Options = {},
): Promise<SupplierAccountMovement[]> {
  const db = await getDb();
  const filter: Filter<AccountMovementDocument> = {};
  if (filters.supplierId) filter.supplierId = filters.supplierId;
  if (filters.shiftId) filter.shiftId = filters.shiftId;
  if (filters.ownerReviewStatus) filter.ownerReviewStatus = filters.ownerReviewStatus;
  const movements = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .find(filter, options)
    .sort({ businessDate: -1, createdAt: -1, _id: -1 })
    .toArray();
  return movements.map(asAccountMovement);
}

export async function markAccountMovementReviewed(id: string, options: Options = {}) {
  const db = await getDb();
  const result = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .updateOne(
      { _id: id, ownerReviewStatus: "PENDING" },
      { $set: { ownerReviewStatus: "REVIEWED" } },
      options,
    );
  if (result.matchedCount === 0) return undefined;
  return getAccountMovement(id, options);
}

export async function getRepaymentInstruction(supplierId: string, options: Options = {}) {
  const db = await getDb();
  const instruction = await db
    .collection<RepaymentInstructionDocument>("supplierRepaymentInstructions")
    .findOne({ _id: supplierId }, options);
  if (!instruction) return undefined;
  return {
    supplierId: instruction.supplierId,
    suggestedDeductionPiasters: instruction.suggestedDeductionPiasters,
    holdPaymentUntil: instruction.holdPaymentUntil,
    note: instruction.note,
    updatedAt: instruction.updatedAt,
  };
}

export async function upsertRepaymentInstruction(
  instruction: SupplierRepaymentInstruction,
  options: Options = {},
) {
  const db = await getDb();
  await db
    .collection<RepaymentInstructionDocument>("supplierRepaymentInstructions")
    .updateOne(
      { _id: instruction.supplierId },
      { $set: instruction, $setOnInsert: { _id: instruction.supplierId } },
      { upsert: true, ...options },
    );
  return instruction;
}
