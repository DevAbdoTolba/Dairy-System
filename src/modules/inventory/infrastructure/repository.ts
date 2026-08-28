import crypto from "node:crypto";
import type { ClientSession, Filter } from "mongodb";
import { getDb, withMongoTransaction } from "@/shared/db";
import type {
  InventoryTransaction,
  TransactionType,
} from "@/modules/transactions/domain/transaction";

export type ProductVariant = {
  id: string;
  nameAr: string;
  weightKg: number;
  visualToken: string;
  sortOrder: number;
  isActive: boolean;
};

export type TransactionWithVariant = InventoryTransaction & {
  variantNameAr: string;
  weightKg: number;
};

type ProductVariantDocument = Omit<ProductVariant, "id"> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};
type InventoryTransactionDocument = InventoryTransaction & { _id: string };
type InventoryBalanceDocument = { _id: string; stock: number };
type AppSettingsDocument = {
  _id: "settings";
  businessName: string;
  locale: string;
  timezone: string;
  startDate: string;
  updatedAt: string;
};

type Options = { session?: ClientSession };

function asVariant(document: ProductVariantDocument): ProductVariant {
  return {
    id: document._id,
    nameAr: document.nameAr,
    weightKg: document.weightKg,
    visualToken: document.visualToken,
    sortOrder: document.sortOrder,
    isActive: document.isActive,
  };
}

function asTransaction(document: InventoryTransactionDocument): InventoryTransaction {
  return {
    id: document.id,
    productVariantId: document.productVariantId,
    type: document.type,
    quantity: document.quantity,
    businessDate: document.businessDate,
    note: document.note,
    overrideReason: document.overrideReason,
    status: document.status,
    reversesTransactionId: document.reversesTransactionId,
    idempotencyKey: document.idempotencyKey,
    createdAt: document.createdAt,
    voidedAt: document.voidedAt,
  };
}

function stockDelta(type: TransactionType, quantity: number) {
  return type === "SALE" || type === "ADJUSTMENT_OUT" ? -quantity : quantity;
}

export async function listActiveVariants(options: Options = {}): Promise<ProductVariant[]> {
  const db = await getDb();
  const variants = await db
    .collection<ProductVariantDocument>("productVariants")
    .find({ isActive: true }, options)
    .sort({ sortOrder: 1 })
    .toArray();
  return variants.map(asVariant);
}

export async function getVariant(
  id: string,
  options: Options = {},
): Promise<ProductVariant | undefined> {
  const db = await getDb();
  const variant = await db
    .collection<ProductVariantDocument>("productVariants")
    .findOne({ _id: id }, options);
  return variant ? asVariant(variant) : undefined;
}

async function calculateLedgerStock(variantId: string, options: Options = {}) {
  const db = await getDb();
  const [result] = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .aggregate<{ stock: number }>(
      [
        { $match: { productVariantId: variantId, status: "ACTIVE" } },
        {
          $group: {
            _id: null,
            stock: {
              $sum: {
                $switch: {
                  branches: [
                    {
                      case: { $in: ["$type", ["SALE", "ADJUSTMENT_OUT"]] },
                      then: { $multiply: ["$quantity", -1] },
                    },
                  ],
                  default: "$quantity",
                },
              },
            },
          },
        },
      ],
      options,
    )
    .toArray();
  return result?.stock ?? 0;
}

async function ensureBalance(variantId: string, options: Options = {}) {
  const db = await getDb();
  const balances = db.collection<InventoryBalanceDocument>("inventoryBalances");
  const existing = await balances.findOne({ _id: variantId }, options);
  if (existing) return existing.stock;
  const stock = await calculateLedgerStock(variantId, options);
  await balances.updateOne(
    { _id: variantId },
    { $setOnInsert: { stock } },
    { upsert: true, ...options },
  );
  return (await balances.findOne({ _id: variantId }, options))?.stock ?? stock;
}

export async function getCurrentStock(variantId: string, options: Options = {}) {
  return ensureBalance(variantId, options);
}

export async function reserveStockChange(
  transaction: Pick<InventoryTransaction, "productVariantId" | "type" | "quantity">,
  allowNegative: boolean,
  options: Options = {},
) {
  const db = await getDb();
  const balances = db.collection<InventoryBalanceDocument>("inventoryBalances");
  await ensureBalance(transaction.productVariantId, options);
  const delta = stockDelta(transaction.type, transaction.quantity);
  const filter: Filter<InventoryBalanceDocument> =
    delta < 0 && !allowNegative
      ? { _id: transaction.productVariantId, stock: { $gte: Math.abs(delta) } }
      : { _id: transaction.productVariantId };
  const result = await balances.updateOne(filter, { $inc: { stock: delta } }, options);
  return result.modifiedCount === 1;
}

export async function listTransactions(
  filters: {
    from?: string;
    to?: string;
    type?: TransactionType;
    variantId?: string;
    includeVoided?: boolean;
    limit?: number;
  } = {},
  options: Options = {},
): Promise<TransactionWithVariant[]> {
  const db = await getDb();
  const filter: Filter<InventoryTransactionDocument> = {};
  if (filters.from || filters.to) {
    filter.businessDate = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  if (filters.type) filter.type = filters.type;
  if (filters.variantId) filter.productVariantId = filters.variantId;
  if (!filters.includeVoided) filter.status = "ACTIVE";
  const limit = Math.min(Math.max(filters.limit ?? 250, 1), 1000);
  const entries = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .find(filter, options)
    .sort({ businessDate: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
  const variants = await db
    .collection<ProductVariantDocument>("productVariants")
    .find({ _id: { $in: [...new Set(entries.map((entry) => entry.productVariantId))] } }, options)
    .toArray();
  const byId = new Map(variants.map((variant) => [variant._id, variant]));
  return entries.map((entry) => {
    const variant = byId.get(entry.productVariantId);
    return {
      ...asTransaction(entry),
      variantNameAr: variant?.nameAr ?? "",
      weightKg: variant?.weightKg ?? 0,
    };
  });
}

export async function findTransactionByIdempotencyKey(
  key: string,
  options: Options = {},
): Promise<InventoryTransaction | undefined> {
  const db = await getDb();
  const transaction = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .findOne({ idempotencyKey: key }, options);
  return transaction ? asTransaction(transaction) : undefined;
}

export async function insertTransaction(transaction: InventoryTransaction, options: Options = {}) {
  const db = await getDb();
  await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .insertOne({ _id: transaction.id, ...transaction }, options);
  return transaction;
}

export async function voidTransaction(id: string, options: Options = {}) {
  const db = await getDb();
  const transaction = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .findOne({ _id: id }, options);
  if (!transaction || transaction.status !== "ACTIVE") return false;
  const timestamp = new Date().toISOString();
  const result = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .updateOne(
      { _id: id, status: "ACTIVE" },
      { $set: { status: "VOIDED", voidedAt: timestamp } },
      options,
    );
  if (result.modifiedCount !== 1) return false;
  const balances = db.collection<InventoryBalanceDocument>("inventoryBalances");
  await ensureBalance(transaction.productVariantId, options);
  await balances.updateOne(
    { _id: transaction.productVariantId },
    { $inc: { stock: -stockDelta(transaction.type, transaction.quantity) } },
    options,
  );
  return true;
}

export async function getTransaction(id: string, options: Options = {}) {
  const db = await getDb();
  const transaction = await db
    .collection<InventoryTransactionDocument>("inventoryTransactions")
    .findOne({ _id: id }, options);
  return transaction ? asTransaction(transaction) : undefined;
}

export async function getInventorySummary(from?: string, to?: string) {
  const variants = await listActiveVariants();
  return Promise.all(
    variants.map(async (variant) => {
      const transactions = await listTransactions({ from, to, variantId: variant.id, limit: 1000 });
      const activeTransactions = transactions.filter((item) => item.status === "ACTIVE");
      const produced = activeTransactions
        .filter((item) => item.type === "PRODUCTION")
        .reduce((sum, item) => sum + item.quantity, 0);
      const sold = activeTransactions
        .filter((item) => item.type === "SALE")
        .reduce((sum, item) => sum + item.quantity, 0);
      const returned = activeTransactions
        .filter((item) => item.type === "RETURN")
        .reduce((sum, item) => sum + item.quantity, 0);
      const stock =
        from || to ? await calculateLedgerStock(variant.id) : await getCurrentStock(variant.id);
      return { ...variant, stock, kilograms: stock * variant.weightKg, produced, sold, returned };
    }),
  );
}

export async function updateSettings(input: { businessName: string; startDate: string }) {
  const db = await getDb();
  await db
    .collection<AppSettingsDocument>("appSettings")
    .updateOne({ _id: "settings" }, { $set: { ...input, updatedAt: new Date().toISOString() } });
}

export async function addVariant(input: { nameAr: string; weightKg: number; visualToken: string }) {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const last = await db
    .collection<ProductVariantDocument>("productVariants")
    .find({})
    .sort({ sortOrder: -1 })
    .limit(1)
    .next();
  const variant: ProductVariant = {
    id: `weight-${input.weightKg}-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    isActive: true,
  };
  await db.collection<ProductVariantDocument>("productVariants").insertOne({
    _id: variant.id,
    ...variant,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.collection<InventoryBalanceDocument>("inventoryBalances").insertOne({
    _id: variant.id,
    stock: 0,
  });
  return variant;
}

export async function setVariantActive(id: string, isActive: boolean) {
  const db = await getDb();
  const result = await db
    .collection<ProductVariantDocument>("productVariants")
    .updateOne({ _id: id }, { $set: { isActive, updatedAt: new Date().toISOString() } });
  return result.modifiedCount === 1;
}

export async function getSettings() {
  const db = await getDb();
  const settings = await db
    .collection<AppSettingsDocument>("appSettings")
    .findOne({ _id: "settings" });
  if (!settings) throw new Error("Application settings are unavailable.");
  return {
    businessName: settings.businessName,
    locale: settings.locale,
    timezone: settings.timezone,
    startDate: settings.startDate,
  };
}

export async function exportDatabase() {
  const db = await getDb();
  const [productVariants, inventoryTransactions, appSettings, ownerAccounts, loginAttempts] =
    await Promise.all([
      db.collection<ProductVariantDocument>("productVariants").find({}).toArray(),
      db.collection<InventoryTransactionDocument>("inventoryTransactions").find({}).toArray(),
      db.collection<AppSettingsDocument>("appSettings").find({}).toArray(),
      db.collection("ownerAccounts").find({}).toArray(),
      db.collection("loginAttempts").find({}).toArray(),
    ]);
  return { productVariants, inventoryTransactions, appSettings, ownerAccounts, loginAttempts };
}

export async function replaceDatabase(data: Awaited<ReturnType<typeof exportDatabase>>) {
  await withMongoTransaction(async (session) => {
    const db = await getDb();
    const names = [
      "productVariants",
      "inventoryTransactions",
      "appSettings",
      "ownerAccounts",
      "loginAttempts",
      "inventoryBalances",
    ] as const;
    for (const name of names) await db.collection(name).deleteMany({}, { session });
    if (data.productVariants.length)
      await db
        .collection<ProductVariantDocument>("productVariants")
        .insertMany(data.productVariants, { session });
    if (data.inventoryTransactions.length)
      await db
        .collection<InventoryTransactionDocument>("inventoryTransactions")
        .insertMany(data.inventoryTransactions, { session });
    if (data.appSettings.length)
      await db
        .collection<AppSettingsDocument>("appSettings")
        .insertMany(data.appSettings, { session });
    if (data.ownerAccounts.length)
      await db.collection("ownerAccounts").insertMany(data.ownerAccounts, { session });
    if (data.loginAttempts.length)
      await db.collection("loginAttempts").insertMany(data.loginAttempts, { session });
    const balances = await db
      .collection<InventoryTransactionDocument>("inventoryTransactions")
      .aggregate<{ _id: string; stock: number }>(
        [
          { $match: { status: "ACTIVE" } },
          {
            $group: {
              _id: "$productVariantId",
              stock: {
                $sum: {
                  $cond: [
                    { $in: ["$type", ["SALE", "ADJUSTMENT_OUT"]] },
                    { $multiply: ["$quantity", -1] },
                    "$quantity",
                  ],
                },
              },
            },
          },
        ],
        { session },
      )
      .toArray();
    const allVariants = await db
      .collection<ProductVariantDocument>("productVariants")
      .find({}, { session })
      .toArray();
    if (allVariants.length) {
      await db.collection<InventoryBalanceDocument>("inventoryBalances").insertMany(
        allVariants.map((variant) => ({
          _id: variant._id,
          stock: balances.find((balance) => balance._id === variant._id)?.stock ?? 0,
        })),
        { session },
      );
    }
  });
}
