import { NextResponse } from "next/server";
import { undoTransaction } from "@/modules/transactions/application/service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    undoTransaction((await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر الإلغاء." },
      { status: 422 },
    );
  }
}
