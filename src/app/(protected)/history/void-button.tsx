"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function VoidButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function voidEntry() {
    if (!window.confirm("تأكيد إلغاء الحركة؟ سيبقى السجل محفوظاً للمراجعة.")) return;
    setBusy(true);
    const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return (
    <Button
      type="button"
      size="small"
      color="warning"
      variant="outlined"
      disabled={busy}
      onClick={voidEntry}
    >
      {busy ? "جارٍ الإلغاء…" : "إلغاء"}
    </Button>
  );
}
