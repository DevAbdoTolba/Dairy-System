import crypto from "node:crypto";
import { getDb } from "@/shared/db";
import type { Role } from "../domain/role";

const SCRYPT_KEY_LENGTH = 64;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

type CredentialAccount = {
  _id: "owner" | "pos";
  username: "owner" | "pos";
  passwordHash: string;
  credentialVersion?: number;
  createdAt: string;
  updatedAt: string;
};

type LoginAttempt = {
  _id: string;
  attempts: number;
  windowStartedAt: string;
  lockedUntil: string | null;
};

export type AuthenticatedCredential = {
  role: Role;
  credentialVersion: number;
};

function accountDetails(role: Role) {
  return role === "OWNER"
    ? {
        id: "owner" as const,
        username: "owner" as const,
        collection: "ownerAccounts",
        envPin: "DAIRY_OWNER_PIN" as const,
      }
    : {
        id: "pos" as const,
        username: "pos" as const,
        collection: "posAccounts",
        envPin: "DAIRY_POS_PIN" as const,
      };
}

function hashPin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyPin(pin: string, stored: string) {
  const [algorithm, salt, digest] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const candidate = crypto.scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  const storedBuffer = Buffer.from(digest, "hex");
  return (
    candidateBuffer.length === storedBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, storedBuffer)
  );
}

function accountFromPin(
  details: ReturnType<typeof accountDetails>,
  pin: string,
): CredentialAccount {
  const timestamp = new Date().toISOString();
  return {
    _id: details.id,
    username: details.username,
    passwordHash: hashPin(pin),
    credentialVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function ensureAccount(role: Role) {
  const details = accountDetails(role);
  const db = await getDb();
  const accounts = db.collection<CredentialAccount>(details.collection);
  const existing = await accounts.findOne({ _id: details.id });
  if (existing) return existing;

  const pin = process.env[details.envPin];
  if (!pin && process.env.NODE_ENV === "production") {
    throw new Error(
      role === "OWNER"
        ? "رمز المالك غير مضبوط في إعدادات التطبيق."
        : "رمز استلام اللبن غير مضبوط بعد. سجّل دخولك كمالك واضبطه من الإعدادات.",
    );
  }
  const account = accountFromPin(details, pin ?? "123456");
  await accounts.insertOne(account);
  return account;
}

async function authenticate(role: Role, pin: string, subject: string) {
  const account = await ensureAccount(role);
  const db = await getDb();
  const attempts = db.collection<LoginAttempt>("loginAttempts");
  const now = Date.now();
  const attemptId = `${role}:${subject}`;
  const attempt = await attempts.findOne({ _id: attemptId });
  if (attempt?.lockedUntil && new Date(attempt.lockedUntil).valueOf() > now) {
    throw new Error("تم إيقاف المحاولة مؤقتاً. أعد المحاولة بعد 15 دقيقة.");
  }
  if (verifyPin(pin, account.passwordHash)) {
    await attempts.deleteOne({ _id: attemptId });
    return {
      role,
      credentialVersion: account.credentialVersion ?? 1,
    } satisfies AuthenticatedCredential;
  }
  const startedAt = attempt ? new Date(attempt.windowStartedAt).valueOf() : now;
  const count = !attempt || now - startedAt > WINDOW_MS ? 1 : attempt.attempts + 1;
  const lockedUntil = count >= MAX_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null;
  await attempts.updateOne(
    { _id: attemptId },
    {
      $set: {
        attempts: count,
        windowStartedAt: new Date(startedAt).toISOString(),
        lockedUntil,
      },
    },
    { upsert: true },
  );
  return null;
}

export async function authenticateOwner(pin: string, subject: string) {
  return authenticate("OWNER", pin, subject);
}

export async function authenticatePos(pin: string, subject: string) {
  return authenticate("POS", pin, subject);
}

export async function getCredentialVersion(role: Role) {
  return (await ensureAccount(role)).credentialVersion ?? 1;
}

async function changePin(role: Role, newPin: string) {
  const details = accountDetails(role);
  const db = await getDb();
  const accounts = db.collection<CredentialAccount>(details.collection);
  const existing = await accounts.findOne({ _id: details.id });
  if (!existing) {
    await accounts.insertOne(accountFromPin(details, newPin));
    return;
  }
  await accounts.updateOne(
    { _id: details.id },
    {
      $set: { passwordHash: hashPin(newPin), updatedAt: new Date().toISOString() },
      $inc: { credentialVersion: 1 },
    },
  );
}

export async function changeOwnerPin(currentPin: string, newPin: string) {
  if (!(await authenticateOwner(currentPin, "owner-pin-change")))
    throw new Error("رمز الدخول الحالي غير صحيح.");
  await changePin("OWNER", newPin);
}

export async function changePosPin(newPin: string) {
  await changePin("POS", newPin);
}
