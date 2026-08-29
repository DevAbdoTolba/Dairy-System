import { MongoClient, type ClientSession, type Db } from "mongodb";

const DEFAULT_DATABASE_NAME = "dairy_system";
type StoredDocument = { _id: string; [key: string]: unknown };

declare global {
  var dairyMongoClient: MongoClient | undefined;
  var dairyMongoReady: Promise<Db> | undefined;
}

function connectionString() {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error("MONGODB_URI is required. Add your MongoDB Atlas connection string.");
  return value;
}

function databaseName() {
  return process.env.MONGODB_DB?.trim() || DEFAULT_DATABASE_NAME;
}

export async function getMongoClient() {
  if (!global.dairyMongoClient) {
    global.dairyMongoClient = new MongoClient(connectionString(), {
      appName: "dairy-system",
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8_000,
      retryReads: true,
      retryWrites: true,
    });
  }
  await global.dairyMongoClient.connect();
  return global.dairyMongoClient;
}

async function prepareDatabase() {
  const client = await getMongoClient();
  const db = client.db(databaseName());
  const timestamp = new Date().toISOString();

  await Promise.all([
    db
      .collection<StoredDocument>("productVariants")
      .createIndex(
        { weightKg: 1 },
        { unique: true, partialFilterExpression: { isActive: true }, name: "active_weight_unique" },
      ),
    db.collection<StoredDocument>("productVariants").createIndex({ sortOrder: 1 }),
    db
      .collection<StoredDocument>("inventoryTransactions")
      .createIndex({ idempotencyKey: 1 }, { unique: true, name: "idempotency_unique" }),
    db
      .collection<StoredDocument>("inventoryTransactions")
      .createIndex({ businessDate: -1, createdAt: -1 }),
    db
      .collection<StoredDocument>("inventoryTransactions")
      .createIndex({ productVariantId: 1, status: 1 }),
    db.collection<StoredDocument>("loginAttempts").createIndex({ lockedUntil: 1 }),
    db.collection<StoredDocument>("suppliers").createIndex({ active: 1, sortOrder: 1, sortKey: 1 }),
    db
      .collection<StoredDocument>("supplierShifts")
      .createIndex({ businessDate: 1, type: 1 }, { unique: true, name: "shift_date_type_unique" }),
    db.collection<StoredDocument>("supplierShifts").createIndex({ status: 1, businessDate: -1 }),
    db.collection<StoredDocument>("supplierMilkEntries").createIndex({ shiftId: 1, createdAt: 1 }),
    db
      .collection<StoredDocument>("supplierMilkEntries")
      .createIndex({ supplierId: 1, businessDate: -1 }),
    db
      .collection<StoredDocument>("supplierMilkPrices")
      .createIndex(
        { milkType: 1, effectiveFrom: 1 },
        { unique: true, name: "milk_price_type_date_unique" },
      ),
    db
      .collection<StoredDocument>("supplierMilkPrices")
      .createIndex({ milkType: 1, effectiveFrom: -1 }),
    db
      .collection<StoredDocument>("supplierAccountMovements")
      .createIndex({ supplierId: 1, businessDate: -1, createdAt: -1 }),
    db
      .collection<StoredDocument>("supplierAccountMovements")
      .createIndex({ ownerReviewStatus: 1, createdAt: -1 }),
    db.collection<StoredDocument>("supplierAccountMovements").createIndex({ settlementId: 1 }),
    db.collection<StoredDocument>("supplierRepaymentInstructions").createIndex({ updatedAt: -1 }),
    db
      .collection<StoredDocument>("supplierEvents")
      .createIndex({ aggregateType: 1, aggregateId: 1, createdAt: 1 }),
  ]);

  await db.collection<StoredDocument>("appSettings").updateOne(
    { _id: "settings" },
    {
      $setOnInsert: {
        businessName: "نظام معمل الجبنة",
        locale: "ar-EG",
        timezone: "Africa/Cairo",
        startDate: timestamp.slice(0, 10),
        updatedAt: timestamp,
      },
    },
    { upsert: true },
  );

  const variants = [
    ["weight-5", "5 كجم", 5, "weight-5", 1],
    ["weight-8", "8 كجم", 8, "weight-8", 2],
    ["weight-10", "10 كجم", 10, "weight-10", 3],
    ["weight-15", "15 كجم", 15, "weight-15", 4],
  ] as const;
  await db.collection<StoredDocument>("productVariants").bulkWrite(
    variants.map(([id, nameAr, weightKg, visualToken, sortOrder]) => ({
      updateOne: {
        filter: { _id: id },
        update: {
          $setOnInsert: {
            nameAr,
            weightKg,
            visualToken,
            sortOrder,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        },
        upsert: true,
      },
    })),
  );
  await db.collection<StoredDocument>("inventoryBalances").bulkWrite(
    variants.map(([id]) => ({
      updateOne: { filter: { _id: id }, update: { $setOnInsert: { stock: 0 } }, upsert: true },
    })),
  );
  return db;
}

export function getDb(): Promise<Db> {
  if (!global.dairyMongoReady) global.dairyMongoReady = prepareDatabase();
  return global.dairyMongoReady;
}

export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    return await session.withTransaction(operation, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    await session.endSession();
  }
}

export async function closeDatabaseForTests() {
  await global.dairyMongoClient?.close();
  global.dairyMongoClient = undefined;
  global.dairyMongoReady = undefined;
}
