import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tempDir = "";
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dairy-backup-"));
  process.env.DAIRY_DATABASE_PATH = path.join(tempDir, "data.sqlite");
  process.env.DAIRY_BACKUP_PATH = path.join(tempDir, "backups");
});
afterEach(async () => {
  const db = await import("@/shared/db");
  db.closeDatabaseForTests();
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DAIRY_DATABASE_PATH;
  delete process.env.DAIRY_BACKUP_PATH;
});
describe("online backup", () => {
  it("creates a verified readable backup", async () => {
    const { createBackup, validateBackup } = await import("./backup");
    const backup = await createBackup();
    expect(fs.existsSync(backup)).toBe(true);
    expect(() => validateBackup(backup)).not.toThrow();
  });
});
