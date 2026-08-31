import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { setRepaymentInstruction } from "@/modules/suppliers/application/account-service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const result = await setRepaymentInstruction(await request.json());
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "تعذر حفظ التعليمات.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
