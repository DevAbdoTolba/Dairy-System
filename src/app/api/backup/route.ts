import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createBackup, removeOldBackups } from "@/shared/backup/backup";
import { hasOwnerSession } from "@/modules/auth/infrastructure/session";

export const runtime = "nodejs";
export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const backupPath = await createBackup();
    removeOldBackups();
    return new NextResponse(fs.readFileSync(backupPath), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${path.basename(backupPath)}"`,
        "X-Backup-File": path.basename(backupPath),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية." },
      { status: 500 },
    );
  }
}
