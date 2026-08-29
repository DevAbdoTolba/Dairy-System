const VERSION = "v3";
const SHELL_CACHE = `dairy-shell-${VERSION}`;
const PAGE_CACHE = `dairy-pages-${VERSION}`;
const STATIC_CACHE = `dairy-static-${VERSION}`;
const OFFLINE_DATABASE_NAME = "dairy-offline";
const OFFLINE_DATABASE_VERSION = 1;
const OFFLINE_TRANSACTION_STORE = "transactions";
const SYNC_TAG = "dairy-transaction-sync";
const APP_CACHES = [SHELL_CACHE, PAGE_CACHE, STATIC_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/manifest.webmanifest", "/icon.svg", "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("dairy-") && !APP_CACHES.includes(key))
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionFinished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
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
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

async function listOutbox() {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readonly");
  const entries = await requestResult(transaction.objectStore(OFFLINE_TRANSACTION_STORE).getAll());
  await transactionFinished(transaction);
  database.close();
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function putOutbox(payload) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_TRANSACTION_STORE);
  const existing = await requestResult(store.get(payload.idempotencyKey));
  if (!existing) {
    store.put({
      idempotencyKey: payload.idempotencyKey,
      endpoint: "/api/transactions",
      method: "POST",
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      state: "pending",
      lastError: null,
    });
  }
  await transactionFinished(transaction);
  database.close();
}

async function removeOutbox(idempotencyKey) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  transaction.objectStore(OFFLINE_TRANSACTION_STORE).delete(idempotencyKey);
  await transactionFinished(transaction);
  database.close();
}

async function failOutbox(entry, message) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(OFFLINE_TRANSACTION_STORE, "readwrite");
  transaction.objectStore(OFFLINE_TRANSACTION_STORE).put({
    ...entry,
    attempts: entry.attempts + 1,
    state: "failed",
    lastError: message,
  });
  await transactionFinished(transaction);
  database.close();
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

async function notify(title, options) {
  if (self.Notification?.permission !== "granted") return;
  await self.registration.showNotification(title, {
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    dir: "rtl",
    lang: "ar",
    ...options,
  });
}

async function registerSync() {
  try {
    await self.registration.sync?.register(SYNC_TAG);
  } catch {
    // The open app's `online` listener is the cross-browser fallback.
  }
}

function temporaryFailure(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function queueTransaction(request) {
  const payload = await request.json();
  await putOutbox(payload);
  await registerSync();
  await broadcast({ type: "OUTBOX_UPDATED" });
  await notify("تم الحفظ على الجهاز", {
    body: "العملية محفوظة دون إنترنت وستتم مزامنتها تلقائياً.",
    tag: `dairy-queued-${payload.idempotencyKey}`,
  });
  return new Response(JSON.stringify({ queued: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

async function transactionNetworkFirst(request) {
  const offlineCopy = request.clone();
  try {
    const response = await fetch(request);
    if (!temporaryFailure(response.status)) return response;
  } catch {
    // Persist the request below.
  }
  return queueTransaction(offlineCopy);
}

async function flushOutbox() {
  const entries = (await listOutbox()).filter((entry) => entry.state === "pending");
  let synced = 0;
  for (const entry of entries) {
    let response;
    try {
      response = await fetch(entry.endpoint, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(entry.payload),
      });
    } catch (error) {
      throw error;
    }
    if (response.ok) {
      await removeOutbox(entry.idempotencyKey);
      synced += 1;
      continue;
    }
    if (temporaryFailure(response.status)) throw new Error("Temporary synchronization failure");
    let body = {};
    try {
      body = await response.json();
    } catch {
      // A readable fallback is stored below.
    }
    await failOutbox(
      entry,
      response.status === 403
        ? "انتهت جلسة الدخول. ادخل من جديد ثم أعد المحاولة."
        : (body.error ?? "رفض الخادم العملية."),
    );
  }
  await broadcast({ type: synced > 0 ? "OUTBOX_SYNCED" : "OUTBOX_UPDATED", count: synced });
  if (synced > 0) {
    await notify("اكتملت المزامنة", {
      body: `تم رفع ${synced} عملية محفوظة إلى قاعدة البيانات.`,
      tag: "dairy-sync-complete",
    });
  }
  return synced;
}

async function cacheStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function cachePrivateRoutes() {
  const cache = await caches.open(PAGE_CACHE);
  const routes = ["/dashboard", "/inventory", "/history", "/reports", "/settings"];
  await Promise.all(
    routes.map(async (route) => {
      try {
        const response = await fetch(route, { credentials: "same-origin" });
        if (response.ok && !response.redirected) await cache.put(route, response);
      } catch {
        // A previous cached copy remains usable while offline.
      }
    }),
  );
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    const responsePath = response.url ? new URL(response.url).pathname : "";
    if (response.ok && !response.redirected && responsePath !== "/login") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      return (
        (await cache.match("/dashboard")) ??
        new Response("افتح التطبيق مرة واحدة بالإنترنت قبل استخدامه دون اتصال.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }
    return new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.method === "POST" && url.pathname === "/api/transactions") {
    event.respondWith(transactionNetworkFirst(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheStatic(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushOutbox());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OUTBOX") {
    event.waitUntil(flushOutbox().catch(() => undefined));
  }
  if (event.data?.type === "SHOW_NOTIFICATION") {
    event.waitUntil(
      notify(event.data.title, {
        body: event.data.body,
        tag: event.data.tag,
      }),
    );
  }
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
  if (event.data?.type === "CACHE_PRIVATE_ROUTES") {
    event.waitUntil(cachePrivateRoutes());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const openClient = clients.find((client) => "focus" in client);
      return openClient ? openClient.focus() : self.clients.openWindow("/dashboard");
    }),
  );
});
