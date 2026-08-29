"use client";

import type { QueuedTransaction, OfflineTransactionInput } from "./offline-queue";
import {
  listQueuedTransactions,
  removeQueuedTransaction,
  resetFailedTransactions,
  saveQueuedTransaction,
  updateQueuedTransaction,
} from "./offline-store";

type SyncManagerLike = { register(tag: string): Promise<void> };
type RegistrationWithSync = ServiceWorkerRegistration & { sync?: SyncManagerLike };
type ApiResult = { error?: string; duplicate?: boolean; queued?: boolean };

let activeFlush: Promise<{ synced: number; failed: number }> | null = null;

async function responseBody(response: Response): Promise<ApiResult> {
  try {
    return (await response.json()) as ApiResult;
  } catch {
    return {};
  }
}

function isTemporaryFailure(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function tellServiceWorker(message: Record<string, unknown>) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  (registration.active ?? navigator.serviceWorker.controller)?.postMessage(message);
}

async function showSystemNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  await tellServiceWorker({ type: "SHOW_NOTIFICATION", title, body, tag });
}

export async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  const registration = (await navigator.serviceWorker.ready) as RegistrationWithSync;
  try {
    await registration.sync?.register("dairy-transaction-sync");
  } catch {
    // The online event below is the fallback on browsers without Background Sync.
  }
  if (navigator.onLine) registration.active?.postMessage({ type: "FLUSH_OUTBOX" });
}

async function queueForLater(payload: OfflineTransactionInput) {
  await saveQueuedTransaction(payload);
  void requestBackgroundSync();
  void showSystemNotification(
    "تم الحفظ على الجهاز",
    "العملية محفوظة دون إنترنت وستتم مزامنتها تلقائياً.",
    `dairy-queued-${payload.idempotencyKey}`,
  );
  return { status: "queued" as const, duplicate: false };
}

export async function submitTransactionOfflineFirst(payload: OfflineTransactionInput) {
  if (!navigator.onLine) return queueForLater(payload);
  try {
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await responseBody(response);
    if (response.status === 202 && body.queued) {
      return { status: "queued" as const, duplicate: false };
    }
    if (!response.ok) {
      if (isTemporaryFailure(response.status)) return queueForLater(payload);
      throw new Error(body.error ?? "تعذر حفظ الحركة.");
    }
    return { status: "synced" as const, duplicate: Boolean(body.duplicate) };
  } catch (error) {
    if (error instanceof TypeError) return queueForLater(payload);
    throw error;
  }
}

async function sendQueuedEntry(entry: QueuedTransaction) {
  const response = await fetch(entry.endpoint, {
    method: entry.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry.payload),
  });
  const body = await responseBody(response);
  return { response, body };
}

export function flushQueuedTransactions() {
  if (activeFlush) return activeFlush;
  activeFlush = (async () => {
    let synced = 0;
    let failed = 0;
    const entries = (await listQueuedTransactions()).filter((entry) => entry.state === "pending");
    for (const entry of entries) {
      try {
        const { response, body } = await sendQueuedEntry(entry);
        if (response.status === 202 && body.queued) break;
        if (response.ok) {
          await removeQueuedTransaction(entry.idempotencyKey);
          synced += 1;
          continue;
        }
        if (isTemporaryFailure(response.status)) break;
        await updateQueuedTransaction(entry.idempotencyKey, (current) => ({
          ...current,
          attempts: current.attempts + 1,
          state: "failed",
          lastError:
            response.status === 403
              ? "انتهت جلسة الدخول. ادخل من جديد ثم أعد المحاولة."
              : (body.error ?? "رفض الخادم العملية."),
        }));
        failed += 1;
      } catch {
        break;
      }
    }
    if (synced > 0) {
      await showSystemNotification(
        "اكتملت المزامنة",
        `تم رفع ${synced} عملية محفوظة إلى قاعدة البيانات.`,
        "dairy-sync-complete",
      );
    }
    return { synced, failed };
  })().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

export async function retryFailedTransactions() {
  await resetFailedTransactions();
  return flushQueuedTransactions();
}

export async function enableOfflineNotifications() {
  if (!("Notification" in window)) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await showSystemNotification(
      "تم تفعيل التنبيهات",
      "سنخبرك بحالة الحفظ والمزامنة.",
      "dairy-notifications-enabled",
    );
  }
  return permission;
}
