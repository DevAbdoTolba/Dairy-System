import crypto from "node:crypto";
import { getSqlite } from "@/shared/db";
import type {
  InventoryTransaction,
  TransactionStatus,
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

type TransactionRow = {
  id: string;
  product_variant_id: string;
  type: TransactionType;
  quantity: number;
  business_date: string;
  note: string | null;
  override_reason: string | null;
  status: TransactionStatus;
  reverses_transaction_id: string | null;
  idempotency_key: string;
  created_at: string;
  voided_at: string | null;
  variant_name_ar?: string;
  weight_kg?: number;
};

function mapTransaction(row: TransactionRow): InventoryTransaction {
  return {
    id: row.id,
    productVariantId: row.product_variant_id,
    type: row.type,
    quantity: row.quantity,
    businessDate: row.business_date,
    note: row.note,
    overrideReason: row.override_reason,
    status: row.status,
    reversesTransactionId: row.reverses_transaction_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  };
}

export function listActiveVariants(): ProductVariant[] {
  return getSqlite()
    .prepare(
      `SELECT id, name_ar as nameAr, weight_kg as weightKg, visual_token as visualToken,
              sort_order as sortOrder, is_active as isActive
       FROM product_variants WHERE is_active = 1 ORDER BY sort_order`,
    )
    .all() as ProductVariant[];
}

export function getVariant(id: string): ProductVariant | undefined {
  return getSqlite()
    .prepare(
      `SELECT id, name_ar as nameAr, weight_kg as weightKg, visual_token as visualToken,
              sort_order as sortOrder, is_active as isActive
       FROM product_variants WHERE id = ?`,
    )
    .get(id) as ProductVariant | undefined;
}

export function getCurrentStock(variantId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(CASE type
          WHEN 'PRODUCTION' THEN quantity
          WHEN 'RETURN' THEN quantity
          WHEN 'ADJUSTMENT_IN' THEN quantity
          WHEN 'SALE' THEN -quantity
          WHEN 'ADJUSTMENT_OUT' THEN -quantity
          ELSE 0 END), 0) as stock
       FROM inventory_transactions WHERE product_variant_id = ? AND status = 'ACTIVE'`,
    )
    .get(variantId) as { stock: number };
  return row.stock;
}

export function listTransactions(
  filters: {
    from?: string;
    to?: string;
    type?: TransactionType;
    variantId?: string;
    includeVoided?: boolean;
    limit?: number;
  } = {},
): TransactionWithVariant[] {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.from) {
    clauses.push("t.business_date >= ?");
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push("t.business_date <= ?");
    values.push(filters.to);
  }
  if (filters.type) {
    clauses.push("t.type = ?");
    values.push(filters.type);
  }
  if (filters.variantId) {
    clauses.push("t.product_variant_id = ?");
    values.push(filters.variantId);
  }
  if (!filters.includeVoided) clauses.push("t.status = 'ACTIVE'");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 250, 1), 1000);
  const rows = getSqlite()
    .prepare(
      `SELECT t.*, v.name_ar as variant_name_ar, v.weight_kg
       FROM inventory_transactions t JOIN product_variants v ON v.id = t.product_variant_id
       ${where} ORDER BY t.business_date DESC, t.created_at DESC LIMIT ${limit}`,
    )
    .all(...values) as TransactionRow[];
  return rows.map((row) => ({
    ...mapTransaction(row),
    variantNameAr: row.variant_name_ar ?? "",
    weightKg: row.weight_kg ?? 0,
  }));
}

export function findTransactionByIdempotencyKey(key: string) {
  const row = getSqlite()
    .prepare("SELECT * FROM inventory_transactions WHERE idempotency_key = ?")
    .get(key) as TransactionRow | undefined;
  return row ? mapTransaction(row) : undefined;
}

export function insertTransaction(transaction: InventoryTransaction) {
  getSqlite()
    .prepare(
      `INSERT INTO inventory_transactions (
        id, product_variant_id, type, quantity, business_date, note, override_reason,
        status, reverses_transaction_id, idempotency_key, created_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      transaction.id,
      transaction.productVariantId,
      transaction.type,
      transaction.quantity,
      transaction.businessDate,
      transaction.note,
      transaction.overrideReason,
      transaction.status,
      transaction.reversesTransactionId,
      transaction.idempotencyKey,
      transaction.createdAt,
      transaction.voidedAt,
    );
  return transaction;
}

export function voidTransaction(id: string) {
  const now = new Date().toISOString();
  const result = getSqlite()
    .prepare(
      "UPDATE inventory_transactions SET status = 'VOIDED', voided_at = ? WHERE id = ? AND status = 'ACTIVE'",
    )
    .run(now, id);
  return result.changes === 1;
}

export function getTransaction(id: string) {
  const row = getSqlite().prepare("SELECT * FROM inventory_transactions WHERE id = ?").get(id) as
    TransactionRow | undefined;
  return row ? mapTransaction(row) : undefined;
}

export function getInventorySummary(from?: string, to?: string) {
  const variants = listActiveVariants();
  return variants.map((variant) => {
    const transactions = listTransactions({
      from,
      to,
      variantId: variant.id,
      includeVoided: false,
      limit: 1000,
    });
    const produced = transactions
      .filter((item) => item.type === "PRODUCTION")
      .reduce((sum, item) => sum + item.quantity, 0);
    const sold = transactions
      .filter((item) => item.type === "SALE")
      .reduce((sum, item) => sum + item.quantity, 0);
    const returned = transactions
      .filter((item) => item.type === "RETURN")
      .reduce((sum, item) => sum + item.quantity, 0);
    return {
      ...variant,
      stock: getCurrentStock(variant.id),
      kilograms: getCurrentStock(variant.id) * variant.weightKg,
      produced,
      sold,
      returned,
    };
  });
}

export function updateSettings(input: { businessName: string; startDate: string }) {
  getSqlite()
    .prepare(
      "UPDATE app_settings SET business_name = ?, start_date = ?, updated_at = ? WHERE id = 1",
    )
    .run(input.businessName, input.startDate, new Date().toISOString());
}

export function addVariant(input: { nameAr: string; weightKg: number; visualToken: string }) {
  const sqlite = getSqlite();
  const timestamp = new Date().toISOString();
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(sort_order), 0) as sortOrder FROM product_variants")
    .get() as { sortOrder: number };
  const variant: ProductVariant = {
    id: `weight-${input.weightKg}-${crypto.randomUUID().slice(0, 8)}`,
    nameAr: input.nameAr,
    weightKg: input.weightKg,
    visualToken: input.visualToken,
    sortOrder: row.sortOrder + 1,
    isActive: true,
  };
  sqlite
    .prepare(
      `INSERT INTO product_variants (id, name_ar, weight_kg, visual_token, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      variant.id,
      variant.nameAr,
      variant.weightKg,
      variant.visualToken,
      variant.sortOrder,
      timestamp,
      timestamp,
    );
  return variant;
}

export function setVariantActive(id: string, isActive: boolean) {
  const result = getSqlite()
    .prepare("UPDATE product_variants SET is_active = ?, updated_at = ? WHERE id = ?")
    .run(isActive ? 1 : 0, new Date().toISOString(), id);
  return result.changes === 1;
}

export function getSettings() {
  return getSqlite()
    .prepare(
      "SELECT business_name as businessName, locale, timezone, start_date as startDate FROM app_settings WHERE id = 1",
    )
    .get() as { businessName: string; locale: string; timezone: string; startDate: string };
}
