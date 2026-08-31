"use client";

import {
  createQueuedTransaction,
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_QUEUE_EVENT,
  OFFLINE_SUPPLIER_CACHE_STORE,
  OFFLINE_SUPPLIER_OUTBOX_STORE,
  OFFLINE_SUPPLIER_SNAPSHOT_STORE,
  OFFLINE_TRANSACTION_STORE,
  type OfflineTransactionInput,
  type QueuedTransaction,
} from "./offline-queue";

let databasePromise: Promise<IDBDatabase> | null = null;

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

export function openOfflineDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_TRANSACTION_STORE)) {
        const store = database.createObjectStore(OFFLINE_TRANSACTION_STORE, {
          keyPath: "idempotencyKey",
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("state", "state", { unique: false });
      }
      if (!database.objectStoreNames.contains(OFFLINE_SUPPLIER_OUTBOX_STORE)) {
        const store = database.createObjectStore(OFFLINE_SUPPLIER_OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("state", "state", { unique: false });
      }
      if (!database.objectStoreNames.contains(OFFLINE_SUPPLIER_CACHE_STORE)) {
        database.createObjectStore(OFFLINE_SUPPLIER_CACHE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_SUPPLIER_SNAPSHOT_STORE)) {
        database.createObjectStore(OFFLINE_SUPPLIER_SNAPSHOT_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  return databasePromise;
}

export function announceQueueChange() {
  window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(OFFLINE_QUEUE_EVENT);
    channel.postMessage({ type: "OUTBOX_UPDATED" });
    channel.close();
  }
}

export async function listQueuedTransactions(): Promise<QueuedTransaction[]> {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readonly");
  const entries = await requestResult(
    transaction.objectStore(OFFLINE_TRANSACTION_STORE).getAll() as IDBRequest<QueuedTransaction[]>,
  );
  await transactionFinished(transaction);
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function saveQueuedTransaction(payload: OfflineTransactionInput) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_TRANSACTION_STORE);
  const existing = await requestResult(
    store.get(payload.idempotencyKey) as IDBRequest<QueuedTransaction | undefined>,
  );
  const entry = existing ?? createQueuedTransaction(payload);
  store.put(entry);
  await transactionFinished(transaction);
  announceQueueChange();
  return entry;
}

export async function removeQueuedTransaction(idempotencyKey: string) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  transaction.objectStore(OFFLINE_TRANSACTION_STORE).delete(idempotencyKey);
  await transactionFinished(transaction);
  announceQueueChange();
}

export async function updateQueuedTransaction(
  idempotencyKey: string,
  update: (entry: QueuedTransaction) => QueuedTransaction,
) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_TRANSACTION_STORE);
  const entry = await requestResult(
    store.get(idempotencyKey) as IDBRequest<QueuedTransaction | undefined>,
  );
  if (entry) store.put(update(entry));
  await transactionFinished(transaction);
  announceQueueChange();
}

export async function resetFailedTransactions() {
  const entries = await listQueuedTransactions();
  await Promise.all(
    entries
      .filter((entry) => entry.state === "failed")
      .map((entry) =>
        updateQueuedTransaction(entry.idempotencyKey, (current) => ({
          ...current,
          state: "pending",
          lastError: null,
        })),
      ),
  );
}

export function listenForQueueChanges(listener: () => void) {
  window.addEventListener(OFFLINE_QUEUE_EVENT, listener);
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(OFFLINE_QUEUE_EVENT) : null;
  channel?.addEventListener("message", listener);
  return () => {
    window.removeEventListener(OFFLINE_QUEUE_EVENT, listener);
    channel?.close();
  };
}
