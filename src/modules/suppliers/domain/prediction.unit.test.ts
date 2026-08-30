import { describe, expect, it } from "vitest";
import { predictSuppliers } from "./prediction";
import type { Supplier } from "./supplier";
import type { MilkType } from "./shift";

const base = {
  posInstruction: null,
  milkTypes: ["COW", "BUFFALO"] as MilkType[],
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const suppliers: Supplier[] = [
  { ...base, id: "a", displayName: "أحمد", nameTokens: ["احمد"], sortOrder: 1, sortKey: "احمد" },
  { ...base, id: "b", displayName: "حسن", nameTokens: ["حسن"], sortOrder: 2, sortKey: "حسن" },
];

describe("supplier prediction", () => {
  it("uses shift history but down-ranks a supplier already handled this shift", () => {
    const result = predictSuppliers({
      suppliers,
      currentShiftId: "today",
      shiftType: "MORNING",
      businessDate: "2026-08-29",
      now: "2026-08-29T06:15:00.000Z",
      visits: [
        {
          supplierId: "a",
          shiftId: "old-1",
          shiftType: "MORNING",
          businessDate: "2026-08-28",
          createdAt: "2026-08-28T06:10:00.000Z",
        },
        {
          supplierId: "a",
          shiftId: "old-2",
          shiftType: "MORNING",
          businessDate: "2026-08-27",
          createdAt: "2026-08-27T06:10:00.000Z",
        },
        {
          supplierId: "a",
          shiftId: "today",
          shiftType: "MORNING",
          businessDate: "2026-08-29",
          createdAt: "2026-08-29T06:00:00.000Z",
        },
      ],
    });
    expect(result.map((supplier) => supplier.id)).toEqual(["b", "a"]);
  });

  it("uses the Cairo month as well as shift and hour", () => {
    const result = predictSuppliers({
      suppliers,
      currentShiftId: "today",
      shiftType: "MORNING",
      businessDate: "2026-08-29",
      now: "2026-08-29T06:15:00.000Z",
      visits: [
        {
          supplierId: "a",
          shiftId: "january",
          shiftType: "MORNING",
          businessDate: "2026-01-29",
          createdAt: "2026-01-29T06:10:00.000Z",
        },
        {
          supplierId: "b",
          shiftId: "august-1",
          shiftType: "MORNING",
          businessDate: "2026-08-27",
          createdAt: "2026-08-27T12:10:00.000Z",
        },
        {
          supplierId: "b",
          shiftId: "august-2",
          shiftType: "MORNING",
          businessDate: "2026-08-28",
          createdAt: "2026-08-28T15:10:00.000Z",
        },
      ],
    });
    expect(result.map((supplier) => supplier.id)).toEqual(["b", "a"]);
  });
});
