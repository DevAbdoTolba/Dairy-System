import { describe, expect, it } from "vitest";
import { compareSuppliers, normalizeSupplierName, supplierNameTokens } from "./supplier";

describe("supplier names", () => {
  it("normalizes Arabic only for lookup while preserving display data elsewhere", () => {
    expect(normalizeSupplierName("  أَحمد ــ طُـلْبَة  ")).toBe("احمد طلبة");
    expect(supplierNameTokens("عبدو أحمد محمد")).toEqual(["عبدو", "احمد", "محمد"]);
  });

  it("uses a deterministic stored order", () => {
    const suppliers = [
      { id: "b", sortOrder: 2, sortKey: "ب" },
      { id: "a", sortOrder: 1, sortKey: "ا" },
      { id: "c", sortOrder: 2, sortKey: "ب" },
    ];
    expect(suppliers.sort(compareSuppliers).map((supplier) => supplier.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
