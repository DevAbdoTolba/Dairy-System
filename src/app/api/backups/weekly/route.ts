import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  enqueueWeeklyFullBackup,
  processPendingDriveBackups,
} from "@/shared/backup/backup-job-service";

export const runtime = "nodejs";

function hasValidSchedulerSecret(request: Request) {
  const secret = process.env.DAIRY_BACKUP_CRON_SECRET;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !received) return false;
  const expectedBytes = Buffer.from(secret);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export async function GET(request: Request) {
  if (!process.env.DAIRY_BACKUP_CRON_SECRET)
    return NextResponse.json({ error: "Backup scheduler is not configured." }, { status: 503 });
  if (!hasValidSchedulerSecret(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const week = await enqueueWeeklyFullBackup();
    return NextResponse.json({ week, ...(await processPendingDriveBackups()) }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Weekly backup failed." },
      { status: 422 },
    );
  }
}
