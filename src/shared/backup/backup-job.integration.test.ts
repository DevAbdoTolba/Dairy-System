import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveBackupPort } from "./drive-backup-port";
import {
  backupJobSummary,
  enqueueBackupJob,
  processPendingDriveBackups,
} from "./backup-job-service";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describeMongo("Drive backup queue", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_backup_job_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("deduplicates jobs and marks a successfully uploaded artifact", async () => {
    const artifactId = crypto.randomUUID();
    await enqueueBackupJob({
      kind: "SHIFT_SNAPSHOT",
      artifactId,
      filename: "shift.json",
      content: "{}",
    });
    await enqueueBackupJob({
      kind: "SHIFT_SNAPSHOT",
      artifactId,
      filename: "ignored-duplicate.json",
      content: "{}",
    });
    const upload = vi.fn(async () => ({ remoteId: "drive-file-1" }));
    const port: DriveBackupPort = { upload };

    expect(await processPendingDriveBackups(25, port)).toMatchObject({ uploaded: 1, pending: 0 });
    expect(await backupJobSummary()).toEqual({ pending: 0, uploaded: 1 });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed upload pending for a later retry", async () => {
    await enqueueBackupJob({
      kind: "SHIFT_SNAPSHOT",
      artifactId: crypto.randomUUID(),
      filename: "shift.json",
      content: "{}",
    });
    const port: DriveBackupPort = {
      upload: async () => {
        throw new Error("Drive unavailable");
      },
    };

    expect(await processPendingDriveBackups(25, port)).toMatchObject({ uploaded: 0, pending: 1 });
    expect(await backupJobSummary()).toEqual({ pending: 1, uploaded: 0 });
  });
});
