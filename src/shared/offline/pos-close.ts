"use client";

import { canonicalJson, type ShiftCloseSnapshot } from "@/modules/suppliers/domain/snapshot";
import { OFFLINE_SUPPLIER_CACHE_STORE, OFFLINE_SUPPLIER_SNAPSHOT_STORE } from "./offline-queue";
import { openOfflineDatabase } from "./offline-store";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 210_000;
export type CredentialRole = "OWNER" | "POS";

type PosVerifier = {
  id: string;
  credentialVersion: number;
  saltHex: string;
  digestHex: string;
  failedAttempts: number;
  lockedUntil: string | null;
  updatedAt: string;
};

function verifierId(role: CredentialRole) {
  return `pos-verifier-${role.toLowerCase()}`;
}

export type LocalShiftSnapshot = {
  id: string;
  shiftId: string;
  snapshot: ShiftCloseSnapshot;
  createdAt: string;
};

type PosCloseWorkspace = {
  shift: {
    id: string;
    businessDate: string;
    type: "MORNING" | "NIGHT";
  };
  entries: Array<{
    id: string;
    supplierId: string;
    milkType: "COW" | "BUFFALO";
    quantityQuarterCupUnits: number;
    revision: number;
    createdAt?: string;
    updatedAt?: string;
    deletedAt: string | null;
  }>;
  cashRecords: Array<{
    id: string;
    supplierId: string;
    milkType: "COW" | "BUFFALO";
    amountPiasters?: number;
    note?: string;
    createdAt: string;
  }>;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePinDigest(pin: string, saltHex: string) {
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g) ?? [], (value) =>
    Number.parseInt(value, 16),
  );
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  return toHex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
      key,
      256,
    ),
  );
}

async function readVerifier(role: CredentialRole) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_CACHE_STORE, "readonly");
  const verifier = await requestResult(
    transaction.objectStore(OFFLINE_SUPPLIER_CACHE_STORE).get(verifierId(role)) as IDBRequest<
      PosVerifier | undefined
    >,
  );
  await transactionFinished(transaction);
  return verifier;
}

async function writeVerifier(role: CredentialRole, verifier: PosVerifier | null) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_CACHE_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_SUPPLIER_CACHE_STORE);
  if (verifier) store.put(verifier);
  else store.delete(verifierId(role));
  await transactionFinished(transaction);
}

export async function savePosCredentialVerifier(
  pin: string,
  credentialVersion: number,
  role: CredentialRole,
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await writeVerifier(role, {
    id: verifierId(role),
    credentialVersion,
    saltHex,
    digestHex: await derivePinDigest(pin, saltHex),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function invalidatePosVerifierIfVersionChanged(
  credentialVersion: number,
  role: CredentialRole,
) {
  const verifier = await readVerifier(role);
  if (verifier && verifier.credentialVersion !== credentialVersion) await writeVerifier(role, null);
}

export async function verifyLocalPosPin(pin: string, role: CredentialRole) {
  const verifier = await readVerifier(role);
  if (!verifier)
    throw new Error(
      role === "OWNER"
        ? "سجّل الدخول كمالك مرة واحدة على الإنترنت قبل الإغلاق دون إنترنت."
        : "أدخل عبر حساب الاستلام مرة واحدة على الإنترنت قبل الإغلاق دون إنترنت.",
    );
  if (verifier.lockedUntil && new Date(verifier.lockedUntil).valueOf() > Date.now())
    throw new Error("تم إيقاف محاولات رمز الاستلام مؤقتًا. أعد المحاولة لاحقًا.");
  const valid = (await derivePinDigest(pin, verifier.saltHex)) === verifier.digestHex;
  await writeVerifier(role, {
    ...verifier,
    failedAttempts: valid ? 0 : verifier.failedAttempts + 1,
    lockedUntil:
      valid || verifier.failedAttempts + 1 < MAX_ATTEMPTS
        ? null
        : new Date(Date.now() + LOCK_MS).toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return valid;
}

export async function createLocalShiftSnapshot(
  workspace: PosCloseWorkspace,
): Promise<ShiftCloseSnapshot> {
  const payload: ShiftCloseSnapshot["payload"] = {
    version: 1,
    shift: {
      id: workspace.shift.id,
      businessDate: workspace.shift.businessDate,
      type: workspace.shift.type,
    },
    entries: workspace.entries
      .map(
        ({
          id,
          supplierId,
          milkType,
          quantityQuarterCupUnits,
          revision,
          createdAt,
          updatedAt,
          deletedAt,
        }) => ({
          id,
          supplierId,
          milkType,
          quantityQuarterCupUnits,
          revision,
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
          deletedAt,
        }),
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
    cashRecordIds: workspace.cashRecords.map((record) => record.id).sort(),
    cashRecords: workspace.cashRecords
      .filter(
        (record): record is typeof record & { amountPiasters: number } =>
          Number.isSafeInteger(record.amountPiasters) && (record.amountPiasters ?? 0) > 0,
      )
      .map(({ id, supplierId, milkType, amountPiasters, note = "", createdAt }) => ({
        id,
        supplierId,
        milkType,
        amountPiasters,
        note,
        createdAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    closedAt: new Date().toISOString(),
  };
  const checksum = toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(payload))),
  );
  return { payload, checksum };
}

export async function persistLocalShiftSnapshot(snapshot: LocalShiftSnapshot) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_SNAPSHOT_STORE, "readwrite");
  transaction.objectStore(OFFLINE_SUPPLIER_SNAPSHOT_STORE).put(snapshot);
  await transactionFinished(transaction);
}

export function downloadLocalShiftSnapshot(snapshot: LocalShiftSnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dairy-shift-${snapshot.snapshot.payload.shift.businessDate}-${snapshot.shiftId}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
