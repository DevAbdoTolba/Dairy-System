import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describeMongo("backup v2 supplier restore", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_backup_restore_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("restores supplier records from a full backup", async () => {
    const { createSupplier } = await import("@/modules/suppliers/application/supplier-service");
    const { listSuppliers } = await import("@/modules/suppliers/infrastructure/repository");
    const { createBackup, restoreBackup } = await import("./backup");
    const original = await createSupplier({ displayName: "فاطمة حسن" });
    const backup = await createBackup();
    await createSupplier({ displayName: "سجل مؤقت" });

    expect((await listSuppliers()).map((supplier) => supplier.id)).toContain(original.id);
    await restoreBackup(backup);

    expect((await listSuppliers()).map((supplier) => supplier.id)).toEqual([original.id]);
  });
});
