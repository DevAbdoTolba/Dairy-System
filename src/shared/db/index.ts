import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function databasePath() {
  return path.resolve(
    process.env.DAIRY_DATABASE_PATH ?? path.join(process.cwd(), "data", "dairy.sqlite"),
  );
}

declare global {
  var dairySqlite: Database.Database | undefined;
}

const now = () => new Date().toISOString();

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = sqlite
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
    .get("001_initial") as { 1: number } | undefined;
  if (applied) return;

  const execute = sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE product_variants (
        id TEXT PRIMARY KEY,
        name_ar TEXT NOT NULL,
        weight_kg INTEGER NOT NULL CHECK (weight_kg > 0),
        visual_token TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX product_variants_active_weight
        ON product_variants(weight_kg) WHERE is_active = 1;
      CREATE TABLE inventory_transactions (
        id TEXT PRIMARY KEY,
        product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
        type TEXT NOT NULL CHECK (type IN ('PRODUCTION', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        business_date TEXT NOT NULL,
        note TEXT,
        override_reason TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
        reverses_transaction_id TEXT REFERENCES inventory_transactions(id),
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        voided_at TEXT
      );
      CREATE INDEX transactions_business_date_idx ON inventory_transactions(business_date DESC);
      CREATE INDEX transactions_variant_idx ON inventory_transactions(product_variant_id);
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        business_name TEXT NOT NULL,
        locale TEXT NOT NULL,
        timezone TEXT NOT NULL,
        start_date TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE owner_accounts (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE login_attempts (
        subject TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        locked_until TEXT
      );
    `);
    const timestamp = now();
    sqlite
      .prepare(
        `INSERT INTO app_settings (id, business_name, locale, timezone, start_date, updated_at)
         VALUES (1, 'نظام معمل الجبنة', 'ar-EG', 'Africa/Cairo', ?, ?)`,
      )
      .run(timestamp.slice(0, 10), timestamp);
    const insertVariant = sqlite.prepare(
      `INSERT INTO product_variants (id, name_ar, weight_kg, visual_token, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    [
      ["weight-5", "5 كجم", 5, "weight-5", 1],
      ["weight-8", "8 كجم", 8, "weight-8", 2],
      ["weight-10", "10 كجم", 10, "weight-10", 3],
      ["weight-15", "15 كجم", 15, "weight-15", 4],
    ].forEach(([id, name, weight, token, sortOrder]) =>
      insertVariant.run(id, name, weight, token, sortOrder, timestamp, timestamp),
    );
    sqlite
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run("001_initial", timestamp);
  });
  execute();
}

export function getSqlite() {
  if (!global.dairySqlite) {
    const target = databasePath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sqlite = new Database(target);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    migrate(sqlite);
    global.dairySqlite = sqlite;
  }
  return global.dairySqlite;
}

export function getDb() {
  return drizzle(getSqlite());
}

export function getDatabasePath() {
  return databasePath();
}

export function closeDatabaseForTests() {
  global.dairySqlite?.close();
  global.dairySqlite = undefined;
}
