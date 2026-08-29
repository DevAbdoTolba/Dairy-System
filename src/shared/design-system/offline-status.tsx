"use client";

import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { QueuedTransaction } from "@/shared/offline/offline-queue";
import {
  announceQueueChange,
  listenForQueueChanges,
  listQueuedTransactions,
} from "@/shared/offline/offline-store";
import {
  enableOfflineNotifications,
  flushQueuedTransactions,
  requestBackgroundSync,
  retryFailedTransactions,
} from "@/shared/offline/offline-sync";

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function currentConnection() {
  return navigator.onLine;
}

export function OfflineStatus() {
  const router = useRouter();
  const online = useSyncExternalStore(subscribeToConnection, currentConnection, () => true);
  const [entries, setEntries] = useState<QueuedTransaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  const refreshQueue = useCallback(async () => {
    try {
      setEntries(await listQueuedTransactions());
    } catch {
      // IndexedDB may be disabled by browser privacy settings.
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const result = await flushQueuedTransactions();
    await refreshQueue();
    setSyncing(false);
    if (result.synced > 0) router.refresh();
  }, [refreshQueue, router]);

  useEffect(() => {
    queueMicrotask(() => {
      setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
      void refreshQueue();
      if (navigator.onLine) void syncNow();
    });
    void navigator.serviceWorker?.ready.then((registration) =>
      registration.active?.postMessage({ type: "CACHE_PRIVATE_ROUTES" }),
    );

    const cameOnline = () => {
      void requestBackgroundSync();
      void syncNow();
    };
    const serviceWorkerMessage = (event: MessageEvent<{ type?: string; count?: number }>) => {
      if (event.data?.type === "OUTBOX_UPDATED" || event.data?.type === "OUTBOX_SYNCED") {
        announceQueueChange();
        void refreshQueue();
        if (event.data.type === "OUTBOX_SYNCED" && (event.data.count ?? 0) > 0) router.refresh();
      }
    };
    window.addEventListener("online", cameOnline);
    navigator.serviceWorker?.addEventListener("message", serviceWorkerMessage);
    const stopListening = listenForQueueChanges(() => void refreshQueue());
    return () => {
      window.removeEventListener("online", cameOnline);
      navigator.serviceWorker?.removeEventListener("message", serviceWorkerMessage);
      stopListening();
    };
  }, [refreshQueue, router, syncNow]);

  const pending = entries.filter((entry) => entry.state === "pending");
  const failed = entries.filter((entry) => entry.state === "failed");

  async function enableNotifications() {
    setNotificationPermission(await enableOfflineNotifications());
  }

  async function retryFailed() {
    setSyncing(true);
    const result = await retryFailedTransactions();
    await refreshQueue();
    setSyncing(false);
    if (result.synced > 0) router.refresh();
  }

  return (
    <Paper
      component="section"
      aria-label="حالة الاتصال والمزامنة"
      aria-live="polite"
      variant="outlined"
      sx={{ mb: 2.5, p: 1.25 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" } }}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", flexGrow: 1 }}>
          <Chip
            icon={online ? <CloudDoneOutlinedIcon /> : <CloudOffOutlinedIcon />}
            label={online ? "متصل" : "دون إنترنت"}
            color={online ? "success" : "warning"}
            variant={online ? "outlined" : "filled"}
          />
          {pending.length > 0 && <Chip label={`${pending.length} بانتظار المزامنة`} color="info" />}
          {failed.length > 0 && <Chip label={`${failed.length} تحتاج مراجعة`} color="error" />}
        </Stack>
        {notificationPermission === "default" && (
          <Button
            type="button"
            size="small"
            variant="outlined"
            startIcon={<NotificationsActiveOutlinedIcon />}
            onClick={enableNotifications}
          >
            تفعيل التنبيهات
          </Button>
        )}
        {pending.length > 0 && online && (
          <Button
            type="button"
            size="small"
            variant="contained"
            startIcon={<SyncOutlinedIcon />}
            disabled={syncing}
            onClick={syncNow}
          >
            {syncing ? "جارٍ الرفع…" : "مزامنة الآن"}
          </Button>
        )}
      </Stack>

      {!online && (
        <Alert severity="warning" sx={{ mt: 1.25 }}>
          يمكنك متابعة التسجيل. تُحفظ العمليات على هذا الجهاز وتُرفع تلقائياً عند عودة الإنترنت.
        </Alert>
      )}
      {failed.length > 0 && (
        <Alert
          severity="error"
          sx={{ mt: 1.25 }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={!online || syncing}
              onClick={retryFailed}
            >
              إعادة المحاولة
            </Button>
          }
        >
          <Typography component="p" variant="body2" sx={{ fontWeight: 800 }}>
            تعذر اعتماد بعض العمليات:
          </Typography>
          <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
            {failed.slice(0, 3).map((entry) => (
              <li key={entry.idempotencyKey}>{entry.lastError ?? "رفض الخادم العملية."}</li>
            ))}
          </Box>
        </Alert>
      )}
      {notificationPermission === "denied" && (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
          التنبيهات محظورة من إعدادات المتصفح؛ المزامنة التلقائية ما زالت تعمل.
        </Typography>
      )}
    </Paper>
  );
}
