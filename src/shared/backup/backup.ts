import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDatabasePath, getSqlite } from "@/shared/db";

function backupDirectory() {
  const target = path.resolve(process.env.DAIRY_BACKUP_PATH ?? path.join(process.cwd(), "backups"));
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function createBackup() {
  const target = path.join(backupDirectory(), `dairy-${timestampName()}.sqlite`);
  await getSqlite().backup(target);
  validateBackup(target);
  return target;
}

export function validateBackup(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error("ملف النسخة الاحتياطية غير موجود.");
  const sqlite = new Database(filePath, { readonly: true });
  try {
    const integrity = sqlite.pragma("integrity_check", { simple: true });
    const schema = sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inventory_transactions'",
      )
      .get();
    if (integrity !== "ok" || !schema) throw new Error("ملف النسخة الاحتياطية غير صالح.");
  } finally {
    sqlite.close();
  }
}

export async function restoreBackup(filePath: string) {
  validateBackup(filePath);
  const current = getDatabasePath();
  const safetyPath = path.join(backupDirectory(), `before-restore-${timestampName()}.sqlite`);
  await getSqlite().backup(safetyPath);
  validateBackup(safetyPath);
  getSqlite().close();
  global.dairySqlite = undefined;
  fs.copyFileSync(filePath, current);
  ["-wal", "-shm"].forEach((suffix) => {
    const stale = `${current}${suffix}`;
    if (fs.existsSync(stale)) fs.rmSync(stale);
  });
  const restored = getSqlite();
  const integrity = restored.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error("فشل فحص سلامة قاعدة البيانات بعد الاستعادة.");
  return safetyPath;
}

export function removeOldBackups(days = 30) {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(backupDirectory())) {
    const fullPath = path.join(backupDirectory(), file);
    if (file.endsWith(".sqlite") && fs.statSync(fullPath).mtimeMs < threshold) fs.rmSync(fullPath);
  }
}
