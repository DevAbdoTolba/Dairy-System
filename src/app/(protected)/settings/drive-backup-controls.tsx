"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

type DriveStatus = {
  configured: boolean;
  connected: boolean;
};

async function resultError(response: Response) {
  try {
    return ((await response.json()) as { error?: string }).error;
  } catch {
    return undefined;
  }
}

export function DriveBackupControls() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/integrations/google-drive", { cache: "no-store" });
    if (!response.ok) throw new Error((await resultError(response)) ?? "تعذر فحص Google Drive.");
    setStatus((await response.json()) as DriveStatus);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/integrations/google-drive", { cache: "no-store" });
        if (!response.ok)
          throw new Error((await resultError(response)) ?? "تعذر فحص Google Drive.");
        if (!cancelled) setStatus((await response.json()) as DriveStatus);
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : "تعذر فحص Google Drive.");
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-drive", { method: "POST" });
      const result = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl)
        throw new Error(result.error ?? "تعذر بدء ربط Google Drive.");
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر بدء ربط Google Drive.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google-drive", { method: "DELETE" });
      if (!response.ok) throw new Error((await resultError(response)) ?? "تعذر قطع الربط.");
      await refresh();
      setMessage("تم قطع ربط Google Drive. تبقى النسخ المحلية والمهام المؤجلة كما هي.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر قطع الربط.");
    } finally {
      setBusy(false);
    }
  }

  async function runBackup(path: "/api/backups/now" | "/api/backups/retry") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const result = (await response.json()) as {
        error?: string;
        uploaded?: number;
        disabled?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "تعذر تجهيز النسخة الاحتياطية.");
      setMessage(
        result.disabled
          ? "تم حفظ مهمة النسخ. اربط Google Drive لرفعها تلقائيًا."
          : result.uploaded
            ? "تم رفع النسخة الاحتياطية إلى Google Drive."
            : "تم حفظ مهمة النسخ وستتم إعادة المحاولة تلقائيًا.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تجهيز النسخة الاحتياطية.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.25} sx={{ pt: 1 }}>
      <Typography component="h3" variant="h3">
        Google Drive (اختياري)
      </Typography>
      <Typography color="text.secondary" variant="body2">
        يبقى النظام يعمل ويغلق الورديات حتى عندما لا يكون Google Drive مربوطًا. تُرفع النسخ المؤجلة
        لاحقًا فقط.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {status && !status.configured && (
        <Alert severity="info">
          أضف إعدادات Google OAuth ومفتاح تشفير النسخ إلى متغيرات البيئة أولًا.
        </Alert>
      )}
      {status?.configured && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {status.connected ? (
            <Button
              type="button"
              color="warning"
              variant="outlined"
              disabled={busy}
              onClick={disconnect}
            >
              قطع ربط Google Drive
            </Button>
          ) : (
            <Button type="button" variant="outlined" disabled={busy} onClick={connect}>
              ربط Google Drive
            </Button>
          )}
          <Button
            type="button"
            variant="outlined"
            disabled={busy}
            onClick={() => runBackup("/api/backups/now")}
          >
            نسخة إلى Drive الآن
          </Button>
          {status.connected && (
            <Button
              type="button"
              variant="text"
              disabled={busy}
              onClick={() => runBackup("/api/backups/retry")}
            >
              إعادة محاولة النسخ المؤجلة
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
