import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";
import { backupFileName, createBackup } from "@/shared/backup/backup";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const backup = await createBackup();
    const filename = backupFileName();
    return new NextResponse(JSON.stringify(backup), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Backup-File": filename,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية." },
      { status: 500 },
    );
  }
}
