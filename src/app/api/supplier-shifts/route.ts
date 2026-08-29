import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { openSupplierShift } from "@/modules/suppliers/application/shift-service";
import { getSession, validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await validateMutation(request, ["OWNER", "POS"])))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "انتهت جلسة الدخول." }, { status: 403 });
    const result = await openSupplierShift(await request.json(), session.role);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر فتح الوردية.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
