import { NextResponse } from "next/server";
import { validateMutation } from "@/modules/auth/infrastructure/session";
import { restoreBackup } from "@/shared/backup/backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("backup");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("اختر ملف نسخة احتياطية صالحاً.");
    if (file.size > 10 * 1024 * 1024) throw new Error("حجم النسخة الاحتياطية يتجاوز 10 ميجابايت.");
    const backup = JSON.parse(await file.text()) as unknown;
    await restoreBackup(backup);
    return NextResponse.redirect(new URL("/settings?restored=1", request.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "فشلت الاستعادة." },
      { status: 422 },
    );
  }
}
