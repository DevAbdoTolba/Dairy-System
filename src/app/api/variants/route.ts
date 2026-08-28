import { NextResponse } from "next/server";
import { createVariant } from "@/modules/settings/application/settings-service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    return NextResponse.json(await createVariant(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إضافة الفئة." },
      { status: 422 },
    );
  }
}
