import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describeMongo("supplier close snapshot recovery", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_snapshot_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("recovers an unsynced shift, milk entry, and POS cash from a verified snapshot", async () => {
    const { closeSupplierShiftWithSnapshot } = await import("../application/shift-service");
    const { createSupplier } = await import("../application/supplier-service");
    const { listAccountMovements, listMilkEntries } = await import("../infrastructure/repository");
    const { canonicalJson } = await import("../domain/snapshot");
    const { backupJobSummary } = await import("@/shared/backup/backup-job-store");
    const supplier = await createSupplier({ displayName: "أمينة علي" });
    const shiftId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const cashId = crypto.randomUUID();
    const timestamp = "2026-08-29T12:00:00.000Z";
    const payload = {
      version: 1 as const,
      shift: { id: shiftId, businessDate: "2026-08-29", type: "MORNING" as const },
      entries: [
        {
          id: entryId,
          supplierId: supplier.id,
          milkType: "COW" as const,
          quantityQuarterCupUnits: 28,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        },
      ],
      cashRecordIds: [cashId],
      cashRecords: [
        {
          id: cashId,
          supplierId: supplier.id,
          amountPiasters: 1_250,
          note: "دفع نقدي",
          createdAt: timestamp,
        },
      ],
      closedAt: timestamp,
    };
    const snapshot = {
      payload,
      checksum: crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex"),
    };

    const result = await closeSupplierShiftWithSnapshot(
      shiftId,
      { commandId: crypto.randomUUID(), snapshot },
      "POS",
    );

    expect(result.shift.status).toBe("CLOSED");
    expect(await backupJobSummary()).toEqual({ pending: 1, uploaded: 0 });
    expect(await listMilkEntries(shiftId)).toMatchObject([
      { id: entryId, supplierId: supplier.id, quantityQuarterCupUnits: 28 },
    ]);
    expect(await listAccountMovements({ shiftId })).toMatchObject([
      {
        id: cashId,
        supplierId: supplier.id,
        amountPiasters: 1_250,
        ownerReviewStatus: "PENDING",
      },
    ]);
  });
});
