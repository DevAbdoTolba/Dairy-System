import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BusinessRuleError, createTransaction } from "@/modules/transactions/application/service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "انتهت جلسة الدخول أو الطلب غير آمن." }, { status: 403 });
  try {
    const result = createTransaction(await request.json());
    return NextResponse.json(
      { transaction: result.transaction, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ الحركة.";
    const status = error instanceof BusinessRuleError || error instanceof ZodError ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
