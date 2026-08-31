import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordShiftCash } from "@/modules/suppliers/application/account-service";
import { getSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await validateMutation(request, ["OWNER", "POS"])))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "انتهت جلسة الدخول." }, { status: 403 });
    const result = await recordShiftCash((await params).id, await request.json(), session.role);
    return NextResponse.json(
      session.role === "POS"
        ? { movement: { id: result.movement.id }, duplicate: result.duplicate }
        : result,
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ النقد.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
