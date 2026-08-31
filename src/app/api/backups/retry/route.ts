import { NextResponse } from "next/server";
import { validateMutation } from "@/modules/auth/infrastructure/session";
import { processPendingDriveBackups } from "@/shared/backup/backup-job-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await validateMutation(request)))
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  return NextResponse.json(await processPendingDriveBackups(), { status: 202 });
}
