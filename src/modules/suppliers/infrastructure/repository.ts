import type { ClientSession, Document, Filter } from "mongodb";
import { getDb } from "@/shared/db";
import type { Role } from "@/modules/auth/domain/role";
import { milkTypes, type MilkType, type MilkEntry, type SupplierShift } from "../domain/shift";
import type { Supplier } from "../domain/supplier";
import type { SupplierVisit } from "../domain/prediction";
import type {
  SupplierAccountMovement,
  SupplierRepaymentInstruction,
} from "../domain/account-ledger";
import type { MilkPricePeriod } from "../domain/price";
import type { SupplierSettlement } from "../domain/settlement";

type Options = { session?: ClientSession };

const supplierBackupCollections = [
  "suppliers",
  "supplierShifts",
  "supplierShiftAliases",
  "supplierMilkEntries",
  "supplierMilkPrices",
  "supplierAccountMovements",
  "supplierRepaymentInstructions",
  "supplierSettlements",
  "supplierEvents",
  "posAccounts",
] as const;

export type SupplierBackupData = {
  [Name in (typeof supplierBackupCollections)[number]]: Document[];
};

type SupplierDocument = Omit<Supplier, "id"> & { _id: string };
type SupplierShiftDocument = Omit<SupplierShift, "id"> & { _id: string };
type SupplierShiftAliasDocument = { _id: string; shiftId: string; createdAt: string };
type MilkEntryDocument = Omit<MilkEntry, "id"> & { _id: string };
type MilkPriceDocument = Omit<MilkPricePeriod, "id"> & { _id: string };
type AccountMovementDocument = Omit<SupplierAccountMovement, "id"> & { _id: string };
type RepaymentInstructionDocument = SupplierRepaymentInstruction & { _id: string };
type SupplierSettlementDocument = Omit<SupplierSettlement, "id"> & { _id: string };
type SupplierEventDocument = {
  _id: string;
  kind: string;
  aggregateType: "SUPPLIER" | "SHIFT" | "MILK_ENTRY" | "PRICE" | "ACCOUNT_MOVEMENT" | "SETTLEMENT";
  aggregateId: string;
  actorRole: Role;
  result: unknown;
  createdAt: string;
};
export type SupplierEventLog = Omit<SupplierEventDocument, "_id"> & { id: string };

function accountMilkTypeFilter(milkType: MilkType): Filter<AccountMovementDocument> {
  return milkType === "COW"
    ? { $or: [{ milkType: "COW" }, { milkType: { $exists: false } }] }
    : { milkType };
}

function settlementMilkTypeFilter(milkType: MilkType): Filter<SupplierSettlementDocument> {
  return milkType === "COW"
    ? { $or: [{ milkType: "COW" }, { milkType: { $exists: false } }] }
    : { milkType };
}

function asSupplier(document: SupplierDocument): Supplier {
  const { _id, ...supplier } = document;
  // Existing suppliers predate the milk-type setting. They remain usable as both
  // types until the owner changes them in the supplier admin page.
  return {
    id: _id,
    ...supplier,
    milkTypes:
      Array.isArray(supplier.milkTypes) && supplier.milkTypes.length > 0
        ? supplier.milkTypes
        : [...milkTypes],
  };
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
  // Account movements created before type-separated accounts are retained in
  // the cow account rather than being copied into both accounts.
  return { id: _id, ...movement, milkType: movement.milkType ?? "COW" };
}

function asSettlement(document: SupplierSettlementDocument): SupplierSettlement {
  const { _id, ...settlement } = document;
  return { id: _id, ...settlement, milkType: settlement.milkType ?? "COW" };
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
    | "displayName"
    | "nameTokens"
    | "sortKey"
    | "posInstruction"
    | "milkTypes"
    | "active"
    | "updatedAt"
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

export async function closeSupplierShift(
  id: string,
  snapshotHash: string,
  actorRole: Role,
  options: Options = {},
) {
  const resolved = await getResolvedShift(id, options);
  if (!resolved) return undefined;
  if (resolved.status === "CLOSED") return resolved;
  const db = await getDb();
  const result = await db.collection<SupplierShiftDocument>("supplierShifts").updateOne(
    { _id: resolved.id, status: "OPEN" },
    {
      $set: {
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        closedByRole: actorRole,
        snapshotHash,
      },
    },
    options,
  );
  if (result.modifiedCount !== 1) return getShift(resolved.id, options);
  return getShift(resolved.id, options);
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
  milkType?: MilkType,
  options: Options = {},
): Promise<MilkEntry[]> {
  const db = await getDb();
  const entries = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .find({ supplierId, ...(milkType ? { milkType } : {}) }, options)
    .sort({ businessDate: 1, createdAt: 1, _id: 1 })
    .toArray();
  return entries.map(asMilkEntry);
}

export async function listUnsettledMilkEntries(
  supplierId: string,
  milkType: MilkType,
  cutoffDate: string,
  options: Options = {},
): Promise<MilkEntry[]> {
  const db = await getDb();
  const entries = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .find(
      {
        supplierId,
        milkType,
        businessDate: { $lte: cutoffDate },
        deletedAt: null,
        settlementId: null,
      },
      options,
    )
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

/** Replays a verified close snapshot inside the caller's Mongo transaction. */
export async function reconcileMilkEntryFromCloseSnapshot(entry: MilkEntry, options: Options = {}) {
  const existing = await getMilkEntry(entry.id, options);
  if (!existing) return insertMilkEntry(entry, options);
  const sameImmutableIdentity =
    existing.shiftId === entry.shiftId &&
    existing.supplierId === entry.supplierId &&
    existing.milkType === entry.milkType &&
    existing.businessDate === entry.businessDate &&
    existing.settlementId === null;
  if (!sameImmutableIdentity || existing.revision > entry.revision) return undefined;
  const alreadyMatches =
    existing.quantityQuarterCupUnits === entry.quantityQuarterCupUnits &&
    existing.revision === entry.revision &&
    existing.deletedAt === entry.deletedAt;
  if (alreadyMatches) return existing;
  const db = await getDb();
  const result = await db.collection<MilkEntryDocument>("supplierMilkEntries").updateOne(
    { _id: entry.id, revision: { $lte: entry.revision }, settlementId: null },
    {
      $set: {
        quantityQuarterCupUnits: entry.quantityQuarterCupUnits,
        revision: entry.revision,
        updatedAt: entry.updatedAt,
        deletedAt: entry.deletedAt,
      },
    },
    options,
  );
  if (result.matchedCount !== 1) return undefined;
  return getMilkEntry(entry.id, options);
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
    { _id: id, revision: expectedRevision, deletedAt: null, settlementId: null },
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
    { _id: id, revision: expectedRevision, deletedAt: null, settlementId: null },
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

export async function listSupplierEvents(
  kinds: string[],
  limit = 100,
): Promise<SupplierEventLog[]> {
  const db = await getDb();
  const events = await db
    .collection<SupplierEventDocument>("supplierEvents")
    .find({ kind: { $in: kinds } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return events.map(({ _id, ...event }) => ({ id: _id, ...event }));
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
    milkType?: MilkType;
    shiftId?: string;
    ownerReviewStatus?: SupplierAccountMovement["ownerReviewStatus"];
  } = {},
  options: Options = {},
): Promise<SupplierAccountMovement[]> {
  const db = await getDb();
  const filter: Filter<AccountMovementDocument> = {};
  if (filters.supplierId) filter.supplierId = filters.supplierId;
  if (filters.milkType) Object.assign(filter, accountMilkTypeFilter(filters.milkType));
  if (filters.shiftId) filter.shiftId = filters.shiftId;
  if (filters.ownerReviewStatus) filter.ownerReviewStatus = filters.ownerReviewStatus;
  const movements = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .find(filter, options)
    .sort({ businessDate: -1, createdAt: -1, _id: -1 })
    .toArray();
  return movements.map(asAccountMovement);
}

export async function listUnsettledAccountMovements(
  supplierId: string,
  milkType: MilkType,
  cutoffDate: string,
  options: Options = {},
): Promise<SupplierAccountMovement[]> {
  const db = await getDb();
  const movements = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .find(
      {
        supplierId,
        businessDate: { $lte: cutoffDate },
        settlementId: null,
        ...accountMilkTypeFilter(milkType),
      },
      options,
    )
    .sort({ businessDate: 1, createdAt: 1, _id: 1 })
    .toArray();
  return movements.map(asAccountMovement);
}

export async function linkMilkEntriesToSettlement(
  entryIds: string[],
  settlementId: string,
  options: Options = {},
) {
  if (entryIds.length === 0) return 0;
  const db = await getDb();
  const result = await db
    .collection<MilkEntryDocument>("supplierMilkEntries")
    .updateMany(
      { _id: { $in: entryIds }, deletedAt: null, settlementId: null },
      { $set: { settlementId } },
      options,
    );
  return result.modifiedCount;
}

export async function linkAccountMovementsToSettlement(
  movementIds: string[],
  settlementId: string,
  options: Options = {},
) {
  if (movementIds.length === 0) return 0;
  const db = await getDb();
  const result = await db
    .collection<AccountMovementDocument>("supplierAccountMovements")
    .updateMany(
      { _id: { $in: movementIds }, settlementId: null },
      { $set: { settlementId } },
      options,
    );
  return result.modifiedCount;
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

function repaymentInstructionId(supplierId: string, milkType: MilkType) {
  return `${supplierId}:${milkType}`;
}

export async function getRepaymentInstruction(
  supplierId: string,
  milkType: MilkType,
  options: Options = {},
) {
  const db = await getDb();
  const instruction = await db
    .collection<RepaymentInstructionDocument>("supplierRepaymentInstructions")
    .findOne({ _id: repaymentInstructionId(supplierId, milkType) }, options);
  // The original instruction was one-per-supplier. It belongs to the cow
  // account after the split, matching the legacy movement migration rule.
  const legacyInstruction =
    !instruction && milkType === "COW"
      ? await db
          .collection<RepaymentInstructionDocument>("supplierRepaymentInstructions")
          .findOne({ _id: supplierId }, options)
      : null;
  const resolvedInstruction = instruction ?? legacyInstruction;
  if (!resolvedInstruction) return undefined;
  return {
    supplierId: resolvedInstruction.supplierId,
    milkType: resolvedInstruction.milkType ?? "COW",
    suggestedDeductionPiasters: resolvedInstruction.suggestedDeductionPiasters,
    holdPaymentUntil: resolvedInstruction.holdPaymentUntil,
    note: resolvedInstruction.note,
    updatedAt: resolvedInstruction.updatedAt,
  };
}

export async function upsertRepaymentInstruction(
  instruction: SupplierRepaymentInstruction,
  options: Options = {},
) {
  const db = await getDb();
  await db.collection<RepaymentInstructionDocument>("supplierRepaymentInstructions").updateOne(
    { _id: repaymentInstructionId(instruction.supplierId, instruction.milkType) },
    {
      $set: instruction,
      $setOnInsert: { _id: repaymentInstructionId(instruction.supplierId, instruction.milkType) },
    },
    { upsert: true, ...options },
  );
  return instruction;
}

export async function insertSettlement(settlement: SupplierSettlement, options: Options = {}) {
  const db = await getDb();
  await db
    .collection<SupplierSettlementDocument>("supplierSettlements")
    .insertOne({ _id: settlement.id, ...settlement }, options);
  return settlement;
}

export async function getSettlement(id: string, options: Options = {}) {
  const db = await getDb();
  const settlement = await db
    .collection<SupplierSettlementDocument>("supplierSettlements")
    .findOne({ _id: id }, options);
  return settlement ? asSettlement(settlement) : undefined;
}

export async function listSupplierSettlements(
  supplierId?: string,
  milkType?: MilkType,
  options: Options = {},
): Promise<SupplierSettlement[]> {
  const db = await getDb();
  const settlements = await db
    .collection<SupplierSettlementDocument>("supplierSettlements")
    .find(
      {
        ...(supplierId ? { supplierId } : {}),
        ...(milkType ? settlementMilkTypeFilter(milkType) : {}),
      },
      options,
    )
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  return settlements.map(asSettlement);
}

export async function getLatestSupplierSettlement(
  supplierId: string,
  milkType: MilkType,
  options: Options = {},
) {
  const db = await getDb();
  const settlement = await db
    .collection<SupplierSettlementDocument>("supplierSettlements")
    .find({ supplierId, ...settlementMilkTypeFilter(milkType) }, options)
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .next();
  return settlement ? asSettlement(settlement) : undefined;
}

export async function exportSupplierDatabase(): Promise<SupplierBackupData> {
  const db = await getDb();
  const values = await Promise.all(
    supplierBackupCollections.map((name) => db.collection<Document>(name).find({}).toArray()),
  );
  return Object.fromEntries(
    supplierBackupCollections.map((name, index) => [name, values[index]]),
  ) as unknown as SupplierBackupData;
}

export async function replaceSupplierDatabase(data: SupplierBackupData, session: ClientSession) {
  const db = await getDb();
  for (const name of supplierBackupCollections) {
    await db.collection<Document>(name).deleteMany({}, { session });
    if (data[name].length) await db.collection<Document>(name).insertMany(data[name], { session });
  }
}
