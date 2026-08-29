import { NextResponse } from "next/server";
import { validateMutation } from "@/modules/auth/infrastructure/session";
import { enqueueFullBackup, processPendingDriveBackups } from "@/shared/backup/backup-job-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  try {
    const exportedAt = await enqueueFullBackup();
    const result = await processPendingDriveBackups();
    return NextResponse.json({ exportedAt, ...result }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تجهيز النسخة الاحتياطية." },
      { status: 422 },
    );
  }
}
