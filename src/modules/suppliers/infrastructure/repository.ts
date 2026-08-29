import type { ClientSession, Filter } from "mongodb";
import { getDb } from "@/shared/db";
import type { Role } from "@/modules/auth/domain/role";
import type { MilkEntry, SupplierShift } from "../domain/shift";
import type { Supplier } from "../domain/supplier";

type Options = { session?: ClientSession };

type SupplierDocument = Omit<Supplier, "id"> & { _id: string };
type SupplierShiftDocument = Omit<SupplierShift, "id"> & { _id: string };
type MilkEntryDocument = Omit<MilkEntry, "id"> & { _id: string };
type SupplierEventDocument = {
  _id: string;
  kind: string;
  aggregateType: "SUPPLIER" | "SHIFT" | "MILK_ENTRY";
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
