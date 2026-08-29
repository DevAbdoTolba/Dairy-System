import { describe, expect, it } from "vitest";
import { nextSupplierTokens, suppliersMatchingTokens } from "./trie";
import type { Supplier } from "./supplier";

const base = {
  posInstruction: null,
  active: true,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};
const suppliers: Supplier[] = [
  {
    ...base,
    id: "1",
    displayName: "عبدو أحمد",
    nameTokens: ["عبدو", "احمد"],
    sortOrder: 2,
    sortKey: "عبدو احمد",
  },
  {
    ...base,
    id: "2",
    displayName: "عبدو حسن",
    nameTokens: ["عبدو", "حسن"],
    sortOrder: 1,
    sortKey: "عبدو حسن",
  },
  {
    ...base,
    id: "3",
    displayName: "محمد علي",
    nameTokens: ["محمد", "علي"],
    sortOrder: 3,
    sortKey: "محمد علي",
  },
];

describe("supplier word trie", () => {
  it("offers only valid next words in deterministic order", () => {
    expect(nextSupplierTokens(suppliers, [])).toEqual(["عبدو", "محمد"]);
    expect(nextSupplierTokens(suppliers, ["عبدو"])).toEqual(["احمد", "حسن"]);
    expect(suppliersMatchingTokens(suppliers, ["عبدو"]).map((supplier) => supplier.id)).toEqual([
      "2",
      "1",
    ]);
  });
});
