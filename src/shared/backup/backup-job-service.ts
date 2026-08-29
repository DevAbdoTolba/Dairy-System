import { getDb } from "@/shared/db";
import { backupFileName, createBackup } from "./backup";
import type { DriveBackupPort } from "./drive-backup-port";
import { getGoogleDriveBackupPort } from "./google-drive-adapter";
import { enqueueBackupJob, type BackupJob } from "./backup-job-store";

export { backupJobSummary, enqueueBackupJob } from "./backup-job-store";

function retryAt(attempts: number) {
  return new Date(
    Date.now() + Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(attempts, 10)),
  ).toISOString();
}

export async function enqueueFullBackup() {
  const backup = await createBackup();
  await enqueueBackupJob({
    kind: "FULL",
    artifactId: backup.exportedAt,
    filename: backupFileName(),
    content: JSON.stringify(backup),
  });
  return backup.exportedAt;
}

function cairoDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function weeklyKey(value: Date) {
  const localDate = cairoDate(value);
  const date = new Date(`${localDate}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week = Math.ceil(((date.valueOf() - firstThursday.valueOf()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export async function enqueueWeeklyFullBackup(now = new Date()) {
  const backup = await createBackup();
  const key = weeklyKey(now);
  await enqueueBackupJob({
    kind: "FULL",
    artifactId: `weekly:${key}`,
    filename: `dairy-weekly-backup-${key}.json`,
    content: JSON.stringify(backup),
  });
  return key;
}

export async function processPendingDriveBackups(limit = 25, overridePort?: DriveBackupPort) {
  const port = overridePort ?? (await getGoogleDriveBackupPort());
  if (!port) return { uploaded: 0, pending: 0, disabled: true };
  const db = await getDb();
  const jobs = await db
    .collection<BackupJob>("backupJobs")
    .find({ status: "PENDING", nextAttemptAt: { $lte: new Date().toISOString() } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
  let uploaded = 0;
  for (const job of jobs) {
    try {
      const result = await port.upload({
        id: job.artifactId,
        filename: job.filename,
        content: job.content,
        mimeType: "application/json",
      });
      await db.collection<BackupJob>("backupJobs").updateOne(
        { _id: job._id, status: "PENDING" },
        {
          $set: {
            status: "UPLOADED",
            remoteId: result.remoteId,
            lastError: null,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      uploaded += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      await db.collection<BackupJob>("backupJobs").updateOne(
        { _id: job._id },
        {
          $set: {
            attempts,
            nextAttemptAt: retryAt(attempts),
            lastError: error instanceof Error ? error.message : "Drive backup failed.",
            updatedAt: new Date().toISOString(),
          },
        },
      );
    }
  }
  return { uploaded, pending: jobs.length - uploaded, disabled: false };
}
