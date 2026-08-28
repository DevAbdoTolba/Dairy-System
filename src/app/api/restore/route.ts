import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { restoreBackup } from "@/shared/backup/backup";
import { validateMutation } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("backup");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("اختر ملف نسخة احتياطية صالحاً.");
    const uploadDir = path.join(
      process.env.DAIRY_BACKUP_PATH ?? path.join(process.cwd(), "backups"),
      "uploads",
    );
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, `restore-${Date.now()}.sqlite`);
    fs.writeFileSync(uploadPath, Buffer.from(await file.arrayBuffer()));
    await restoreBackup(uploadPath);
    return NextResponse.redirect(new URL("/settings?restored=1", request.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "فشلت الاستعادة." },
      { status: 422 },
    );
  }
}
