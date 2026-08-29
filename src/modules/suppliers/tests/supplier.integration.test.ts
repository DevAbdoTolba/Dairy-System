import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const describeMongo = process.env.MONGODB_URI ? describe : describe.skip;
let previousDatabase: string | undefined;

describeMongo("supplier milk ledger", () => {
  beforeEach(async () => {
    previousDatabase = process.env.MONGODB_DB;
    process.env.MONGODB_DB = `dairy_supplier_test_${crypto.randomUUID().replaceAll("-", "")}`;
  });

  afterEach(async () => {
    const { closeDatabaseForTests, getDb } = await import("@/shared/db");
    await (await getDb()).dropDatabase();
    await closeDatabaseForTests();
    if (previousDatabase) process.env.MONGODB_DB = previousDatabase;
    else delete process.env.MONGODB_DB;
  });

  it("stores independent cow and buffalo entries exactly once in an open shift", async () => {
    const { createSupplier } = await import("../application/supplier-service");
    const { addMilkEntry, openSupplierShift } = await import("../application/shift-service");
    const { listMilkEntries } = await import("../infrastructure/repository");
    const supplier = await createSupplier({ displayName: "عبدو أحمد" });
    const shift = await openSupplierShift(
      {
        commandId: crypto.randomUUID(),
        shiftId: crypto.randomUUID(),
        businessDate: "2026-08-29",
        type: "MORNING",
      },
      "POS",
    );
    const commandId = crypto.randomUUID();
    const cow = await addMilkEntry(
      shift.shift.id,
      {
        commandId,
        entryId: crypto.randomUUID(),
        supplierId: supplier.id,
        milkType: "COW",
        quantityQuarterCupUnits: 24,
      },
      "POS",
    );
    const duplicate = await addMilkEntry(
      shift.shift.id,
      {
        commandId,
        entryId: crypto.randomUUID(),
        supplierId: supplier.id,
        milkType: "COW",
        quantityQuarterCupUnits: 24,
      },
      "POS",
    );
    await addMilkEntry(
      shift.shift.id,
      {
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        supplierId: supplier.id,
        milkType: "BUFFALO",
        quantityQuarterCupUnits: 12,
      },
      "POS",
    );

    expect(cow.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ duplicate: true, entry: { id: cow.entry.id } });
    expect((await listMilkEntries(shift.shift.id)).map((entry) => entry.milkType)).toEqual([
      "COW",
      "BUFFALO",
    ]);
  });

  it("uses revisions for edit and soft delete without removing ledger history", async () => {
    const { createSupplier } = await import("../application/supplier-service");
    const { addMilkEntry, deleteMilkEntry, openSupplierShift, reviseMilkEntry } =
      await import("../application/shift-service");
    const { getMilkEntry } = await import("../infrastructure/repository");
    const supplier = await createSupplier({ displayName: "محمد حسن" });
    const shift = await openSupplierShift(
      {
        commandId: crypto.randomUUID(),
        shiftId: crypto.randomUUID(),
        businessDate: "2026-08-29",
        type: "NIGHT",
      },
      "POS",
    );
    const created = await addMilkEntry(
      shift.shift.id,
      {
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        supplierId: supplier.id,
        milkType: "COW",
        quantityQuarterCupUnits: 4,
      },
      "POS",
    );
    const revised = await reviseMilkEntry(
      shift.shift.id,
      created.entry.id,
      { commandId: crypto.randomUUID(), expectedRevision: 1, quantityQuarterCupUnits: 8 },
      "POS",
    );
    const deleted = await deleteMilkEntry(
      shift.shift.id,
      created.entry.id,
      { commandId: crypto.randomUUID(), expectedRevision: revised.entry.revision },
      "POS",
    );

    expect(deleted.entry.deletedAt).toEqual(expect.any(String));
    expect((await getMilkEntry(created.entry.id))?.quantityQuarterCupUnits).toBe(8);
  });

  it("uses historical prices and records POS cash as a reviewable principal fact", async () => {
    const { createSupplier } = await import("../application/supplier-service");
    const { addMilkEntry, openSupplierShift } = await import("../application/shift-service");
    const { getSupplierAccount, recordShiftCash, setMilkPrice, setRepaymentInstruction } =
      await import("../application/account-service");
    const supplier = await createSupplier({ displayName: "أمينة محمود" });
    const shift = await openSupplierShift(
      {
        commandId: crypto.randomUUID(),
        shiftId: crypto.randomUUID(),
        businessDate: "2026-08-29",
        type: "MORNING",
      },
      "POS",
    );
    await setMilkPrice({
      commandId: crypto.randomUUID(),
      milkType: "COW",
      effectiveFrom: "2026-08-01",
      pricePiastersPerSatl: 1_000,
    });
    await addMilkEntry(
      shift.shift.id,
      {
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        supplierId: supplier.id,
        milkType: "COW",
        quantityQuarterCupUnits: 24,
      },
      "POS",
    );
    const commandId = crypto.randomUUID();
    const cash = await recordShiftCash(
      shift.shift.id,
      {
        commandId,
        movementId: crypto.randomUUID(),
        supplierId: supplier.id,
        amountPiasters: 700,
      },
      "POS",
    );
    const duplicate = await recordShiftCash(
      shift.shift.id,
      {
        commandId,
        movementId: crypto.randomUUID(),
        supplierId: supplier.id,
        amountPiasters: 700,
      },
      "POS",
    );
    await setRepaymentInstruction({
      commandId: crypto.randomUUID(),
      supplierId: supplier.id,
      suggestedDeductionPiasters: 500,
      holdPaymentUntil: null,
    });
    const account = await getSupplierAccount(supplier.id);

    expect(cash.movement.ownerReviewStatus).toBe("PENDING");
    expect(duplicate).toMatchObject({ duplicate: true, movement: { id: cash.movement.id } });
    expect(account.pricedMilkPiasters).toBe(1_000);
    expect(account.balancePiasters).toBe(300);
    expect(account.instruction?.suggestedDeductionPiasters).toBe(500);
  });
});
