import { NextResponse } from "next/server";
import { saveSettings } from "@/modules/settings/application/settings-service";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function PUT(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    await saveSettings(await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر الحفظ." },
      { status: 422 },
    );
  }
}
