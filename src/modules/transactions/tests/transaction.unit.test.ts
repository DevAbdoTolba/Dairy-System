import { describe, expect, it } from "vitest";
import { calculateStock, stockDelta } from "../domain/transaction";

describe("inventory ledger rules", () => {
  it("calculates stock from active ledger movements", () => {
    expect(
      calculateStock([
        { type: "PRODUCTION", quantity: 12, status: "ACTIVE" },
        { type: "SALE", quantity: 4, status: "ACTIVE" },
        { type: "RETURN", quantity: 1, status: "ACTIVE" },
        { type: "ADJUSTMENT_OUT", quantity: 2, status: "ACTIVE" },
        { type: "SALE", quantity: 99, status: "VOIDED" },
      ]),
    ).toBe(7);
  });
  it("applies the expected direction for every transaction class", () => {
    expect(stockDelta("PRODUCTION", 1)).toBe(1);
    expect(stockDelta("RETURN", 1)).toBe(1);
    expect(stockDelta("ADJUSTMENT_IN", 1)).toBe(1);
    expect(stockDelta("SALE", 1)).toBe(-1);
    expect(stockDelta("ADJUSTMENT_OUT", 1)).toBe(-1);
  });
});
