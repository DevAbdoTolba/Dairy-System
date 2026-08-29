"use client";

import {
  OFFLINE_SUPPLIER_CACHE_STORE,
  OFFLINE_SUPPLIER_OUTBOX_STORE,
  OFFLINE_QUEUE_EVENT,
} from "./offline-queue";
import { announceQueueChange, openOfflineDatabase } from "./offline-store";
import { requestBackgroundSync } from "./offline-sync";

export type SupplierEndpoint =
  | "/api/supplier-shifts"
  | `/api/supplier-shifts/${string}/milk`
  | `/api/supplier-shifts/${string}/milk/${string}`
  | `/api/supplier-shifts/${string}/cash`;

export type SupplierMethod = "POST" | "PUT" | "DELETE";

export type SupplierOutboxEntry = {
  id: string;
  endpoint: SupplierEndpoint;
  method: SupplierMethod;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  state: "pending" | "failed";
  lastError: string | null;
};

type PosCache<T> = { id: "current"; data: T; updatedAt: string };

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

function temporaryFailure(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function responseError(response: Response) {
  try {
    return ((await response.json()) as { error?: string }).error ?? "رفض الخادم العملية.";
  } catch {
    return "رفض الخادم العملية.";
  }
}

export async function cachePosWorkspace<T>(data: T) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_CACHE_STORE, "readwrite");
  transaction.objectStore(OFFLINE_SUPPLIER_CACHE_STORE).put({
    id: "current",
    data,
    updatedAt: new Date().toISOString(),
  } satisfies PosCache<T>);
  await transactionFinished(transaction);
}

export async function readCachedPosWorkspace<T>() {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_CACHE_STORE, "readonly");
  const cached = await requestResult(
    transaction.objectStore(OFFLINE_SUPPLIER_CACHE_STORE).get("current") as IDBRequest<
      PosCache<T> | undefined
    >,
  );
  await transactionFinished(transaction);
  return cached?.data;
}

export async function listSupplierOutbox(): Promise<SupplierOutboxEntry[]> {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_OUTBOX_STORE, "readonly");
  const entries = await requestResult(
    transaction.objectStore(OFFLINE_SUPPLIER_OUTBOX_STORE).getAll() as IDBRequest<
      SupplierOutboxEntry[]
    >,
  );
  await transactionFinished(transaction);
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function putSupplierOutbox(entry: SupplierOutboxEntry) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_OUTBOX_STORE, "readwrite");
  transaction.objectStore(OFFLINE_SUPPLIER_OUTBOX_STORE).put(entry);
  await transactionFinished(transaction);
  announceQueueChange();
}

async function removeSupplierOutbox(id: string) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_SUPPLIER_OUTBOX_STORE, "readwrite");
  transaction.objectStore(OFFLINE_SUPPLIER_OUTBOX_STORE).delete(id);
  await transactionFinished(transaction);
  announceQueueChange();
}

export async function enqueueSupplierCommand(
  input: Omit<SupplierOutboxEntry, "createdAt" | "attempts" | "state" | "lastError">,
) {
  const entries = await listSupplierOutbox();
  const existing = entries.find((entry) => entry.id === input.id);
  if (existing) return existing;
  const entry: SupplierOutboxEntry = {
    ...input,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: "pending",
    lastError: null,
  };
  await putSupplierOutbox(entry);
  void requestBackgroundSync();
  return entry;
}

export async function persistSupplierWorkspaceCommand<T>(
  workspace: T,
  input: Omit<SupplierOutboxEntry, "createdAt" | "attempts" | "state" | "lastError">,
) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(
    [OFFLINE_SUPPLIER_OUTBOX_STORE, OFFLINE_SUPPLIER_CACHE_STORE],
    "readwrite",
  );
  const outbox = transaction.objectStore(OFFLINE_SUPPLIER_OUTBOX_STORE);
  const existing = await requestResult(
    outbox.get(input.id) as IDBRequest<SupplierOutboxEntry | undefined>,
  );
  const entry =
    existing ??
    ({
      ...input,
      createdAt: new Date().toISOString(),
      attempts: 0,
      state: "pending",
      lastError: null,
    } satisfies SupplierOutboxEntry);
  if (!existing) outbox.put(entry);
  transaction.objectStore(OFFLINE_SUPPLIER_CACHE_STORE).put({
    id: "current",
    data: workspace,
    updatedAt: new Date().toISOString(),
  } satisfies PosCache<T>);
  await transactionFinished(transaction);
  announceQueueChange();
  void requestBackgroundSync();
  return entry;
}

export async function submitSupplierCommand<T>(
  input: Omit<SupplierOutboxEntry, "createdAt" | "attempts" | "state" | "lastError">,
) {
  const entry = await enqueueSupplierCommand(input);
  return syncPersistedSupplierCommand<T>(entry);
}

export async function syncPersistedSupplierCommand<T>(entry: SupplierOutboxEntry) {
  if (!navigator.onLine) return { status: "queued" as const, data: undefined };
  try {
    const response = await fetch(entry.endpoint, {
      method: entry.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
    if (!response.ok) {
      const error = await responseError(response);
      if (temporaryFailure(response.status)) return { status: "queued" as const, data: undefined };
      await putSupplierOutbox({
        ...entry,
        attempts: entry.attempts + 1,
        state: "failed",
        lastError: error,
      });
      throw new Error(error);
    }
    const data = (await response.json()) as T;
    await removeSupplierOutbox(entry.id);
    return { status: "synced" as const, data };
  } catch (error) {
    if (error instanceof TypeError) return { status: "queued" as const, data: undefined };
    throw error;
  }
}

export async function flushSupplierOutbox() {
  const entries = (await listSupplierOutbox()).filter((entry) => entry.state === "pending");
  let synced = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const response = await fetch(entry.endpoint, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      if (response.ok) {
        await removeSupplierOutbox(entry.id);
        synced += 1;
        continue;
      }
      if (temporaryFailure(response.status)) break;
      await putSupplierOutbox({
        ...entry,
        attempts: entry.attempts + 1,
        state: "failed",
        lastError: await responseError(response),
      });
      failed += 1;
    } catch {
      break;
    }
  }
  window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  return { synced, failed };
}
