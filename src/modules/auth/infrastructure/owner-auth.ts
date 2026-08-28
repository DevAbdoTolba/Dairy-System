import crypto from "node:crypto";
import { getSqlite } from "@/shared/db";

const SCRYPT_KEY_LENGTH = 64;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function hashPin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyPin(pin: string, stored: string) {
  const [algorithm, salt, digest] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const candidate = crypto.scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}

function ensureOwner() {
  const sqlite = getSqlite();
  const existing = sqlite.prepare("SELECT id FROM owner_accounts WHERE id = 1").get();
  if (existing) return;
  const pin = process.env.DAIRY_OWNER_PIN;
  if (!pin && process.env.NODE_ENV === "production") {
    throw new Error("DAIRY_OWNER_PIN is required in production before the first startup.");
  }
  const timestamp = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT INTO owner_accounts (id, username, password_hash, created_at, updated_at) VALUES (1, 'owner', ?, ?, ?)",
    )
    .run(hashPin(pin ?? "123456"), timestamp, timestamp);
}

export function authenticateOwner(pin: string, subject: string) {
  ensureOwner();
  const sqlite = getSqlite();
  const now = Date.now();
  const attempt = sqlite
    .prepare(
      "SELECT attempts, window_started_at, locked_until FROM login_attempts WHERE subject = ?",
    )
    .get(subject) as
    { attempts: number; window_started_at: string; locked_until: string | null } | undefined;
  if (attempt?.locked_until && new Date(attempt.locked_until).valueOf() > now) {
    throw new Error("تم إيقاف المحاولة مؤقتاً. أعد المحاولة بعد 15 دقيقة.");
  }
  const account = sqlite.prepare("SELECT password_hash FROM owner_accounts WHERE id = 1").get() as {
    password_hash: string;
  };
  if (verifyPin(pin, account.password_hash)) {
    sqlite.prepare("DELETE FROM login_attempts WHERE subject = ?").run(subject);
    return true;
  }
  const startedAt = attempt ? new Date(attempt.window_started_at).valueOf() : now;
  const attempts = !attempt || now - startedAt > WINDOW_MS ? 1 : attempt.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null;
  sqlite
    .prepare(
      `INSERT INTO login_attempts (subject, attempts, window_started_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(subject) DO UPDATE SET attempts = excluded.attempts,
          window_started_at = excluded.window_started_at, locked_until = excluded.locked_until`,
    )
    .run(subject, attempts, new Date(startedAt).toISOString(), lockedUntil);
  return false;
}

export function changeOwnerPin(currentPin: string, newPin: string) {
  ensureOwner();
  const sqlite = getSqlite();
  const account = sqlite.prepare("SELECT password_hash FROM owner_accounts WHERE id = 1").get() as {
    password_hash: string;
  };
  if (!verifyPin(currentPin, account.password_hash)) throw new Error("رمز الدخول الحالي غير صحيح.");
  sqlite
    .prepare("UPDATE owner_accounts SET password_hash = ?, updated_at = ? WHERE id = 1")
    .run(hashPin(newPin), new Date().toISOString());
}
