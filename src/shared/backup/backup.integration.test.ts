import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateBackup } from "./backup";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describe("backup validation", () => {
  it("rejects a file that is not a Dairy MongoDB export", () => {
    expect(() => validateBackup({ format: "sqlite" })).toThrow();
  });
});

describeMongo("MongoDB backup", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_backup_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("creates a validated JSON backup", async () => {
    const { createBackup } = await import("./backup");
    const backup = await createBackup();
    expect(validateBackup(backup).format).toBe("dairy-mongodb-export");
    expect(backup.data.productVariants).toHaveLength(4);
  });
});
