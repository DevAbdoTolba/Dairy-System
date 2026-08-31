import type { ClientSession } from "mongodb";
import { getDb } from "@/shared/db";

export type BackupJobKind = "SHIFT_SNAPSHOT" | "FULL";

export type BackupJob = {
  _id: string;
  kind: BackupJobKind;
  artifactId: string;
  filename: string;
  content: string;
  status: "PENDING" | "UPLOADED";
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  remoteId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Options = { session?: ClientSession };

export async function enqueueBackupJob(
  input: {
    kind: BackupJobKind;
    artifactId: string;
    filename: string;
    content: string;
  },
  options: Options = {},
) {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const id = `${input.kind}:${input.artifactId}`;
  await db.collection<BackupJob>("backupJobs").updateOne(
    { _id: id },
    {
      $setOnInsert: {
        _id: id,
        ...input,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: timestamp,
        lastError: null,
        remoteId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
    { upsert: true, ...options },
  );
}

export async function backupJobSummary() {
  const db = await getDb();
  const [pending, uploaded] = await Promise.all([
    db.collection<BackupJob>("backupJobs").countDocuments({ status: "PENDING" }),
    db.collection<BackupJob>("backupJobs").countDocuments({ status: "UPLOADED" }),
  ]);
  return { pending, uploaded };
}
