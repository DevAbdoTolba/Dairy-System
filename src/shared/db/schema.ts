import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    nameAr: text("name_ar").notNull(),
    weightKg: integer("weight_kg").notNull(),
    visualToken: text("visual_token").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("variants_weight_unique").on(table.weightKg)],
);

export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: text("id").primaryKey(),
  productVariantId: text("product_variant_id").notNull(),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  businessDate: text("business_date").notNull(),
  note: text("note"),
  overrideReason: text("override_reason"),
  status: text("status").notNull().default("ACTIVE"),
  reversesTransactionId: text("reverses_transaction_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  voidedAt: text("voided_at"),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  businessName: text("business_name").notNull(),
  locale: text("locale").notNull(),
  timezone: text("timezone").notNull(),
  startDate: text("start_date").notNull(),
  updatedAt: text("updated_at").notNull(),
});
