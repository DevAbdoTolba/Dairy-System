import crypto from "node:crypto";
import { getDb } from "@/shared/db";

const SCRYPT_KEY_LENGTH = 64;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

type OwnerAccount = {
  _id: "owner";
  username: "owner";
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type LoginAttempt = {
  _id: string;
  attempts: number;
  windowStartedAt: string;
  lockedUntil: string | null;
};

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

async function ensureOwner() {
  const db = await getDb();
  const existing = await db.collection<OwnerAccount>("ownerAccounts").findOne({ _id: "owner" });
  if (existing) return;
  const pin = process.env.DAIRY_OWNER_PIN;
  if (!pin && process.env.NODE_ENV === "production") {
    throw new Error("DAIRY_OWNER_PIN is required in production before the first startup.");
  }
  const timestamp = new Date().toISOString();
  await db.collection<OwnerAccount>("ownerAccounts").updateOne(
    { _id: "owner" },
    {
      $setOnInsert: {
        username: "owner",
        passwordHash: hashPin(pin ?? "123456"),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    { upsert: true },
  );
}

export async function authenticateOwner(pin: string, subject: string) {
  await ensureOwner();
  const db = await getDb();
  const attempts = db.collection<LoginAttempt>("loginAttempts");
  const now = Date.now();
  const attempt = await attempts.findOne({ _id: subject });
  if (attempt?.lockedUntil && new Date(attempt.lockedUntil).valueOf() > now) {
    throw new Error("تم إيقاف المحاولة مؤقتاً. أعد المحاولة بعد 15 دقيقة.");
  }
  const account = await db.collection<OwnerAccount>("ownerAccounts").findOne({ _id: "owner" });
  if (!account) throw new Error("Owner account is unavailable.");
  if (verifyPin(pin, account.passwordHash)) {
    await attempts.deleteOne({ _id: subject });
    return true;
  }
  const startedAt = attempt ? new Date(attempt.windowStartedAt).valueOf() : now;
  const count = !attempt || now - startedAt > WINDOW_MS ? 1 : attempt.attempts + 1;
  const lockedUntil = count >= MAX_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null;
  await attempts.updateOne(
    { _id: subject },
    {
      $set: {
        attempts: count,
        windowStartedAt: new Date(startedAt).toISOString(),
        lockedUntil,
      },
    },
    { upsert: true },
  );
  return false;
}

export async function changeOwnerPin(currentPin: string, newPin: string) {
  await ensureOwner();
  const db = await getDb();
  const accounts = db.collection<OwnerAccount>("ownerAccounts");
  const account = await accounts.findOne({ _id: "owner" });
  if (!account || !verifyPin(currentPin, account.passwordHash))
    throw new Error("رمز الدخول الحالي غير صحيح.");
  await accounts.updateOne(
    { _id: "owner" },
    { $set: { passwordHash: hashPin(newPin), updatedAt: new Date().toISOString() } },
  );
}
