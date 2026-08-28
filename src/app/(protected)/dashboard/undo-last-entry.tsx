"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UndoLastEntry({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function undo() {
    if (!window.confirm("هل تريد إلغاء آخر حركة؟ سيُحفظ سجل الإلغاء.")) return;
    setPending(true);
    const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setPending(false);
    if (response.ok) router.refresh();
  }
  return (
    <Button type="button" variant="outlined" color="warning" onClick={undo} disabled={pending}>
      {pending ? "جارٍ الإلغاء…" : "تراجع عن آخر عملية"}
    </Button>
  );
}
