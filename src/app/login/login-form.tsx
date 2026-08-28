"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "تعذر تسجيل الدخول.");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper
      component="form"
      onSubmit={submit}
      sx={{ width: "100%", maxWidth: 480, p: { xs: 3, sm: 4 } }}
    >
      <Stack spacing={3}>
        <div>
          <Typography component="h1" variant="h1">
            نظام معمل الجبنة
          </Typography>
          <Typography color="text.secondary">أدخل رمز المالك للوصول إلى السجل.</Typography>
        </div>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <TextField
          label="رمز المالك"
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          required
          autoFocus
          slotProps={{
            htmlInput: { inputMode: "numeric", minLength: 6, autoComplete: "current-password" },
          }}
        />
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? "جارٍ الدخول…" : "دخول"}
        </Button>
        <Typography variant="body2" color="text.secondary">
          في أول تشغيل للتطوير فقط، الرمز الافتراضي هو 123456. اضبط رمزاً خاصاً قبل التشغيل الفعلي.
        </Typography>
      </Stack>
    </Paper>
  );
}
