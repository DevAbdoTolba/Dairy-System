import { describe, expect, it } from "vitest";
import { calculateMetrics, percentageOrDash } from "../domain/metrics";

describe("report metrics", () => {
  it("uses a dash value when a formula denominator is zero", () => {
    expect(percentageOrDash(4, 0)).toBeNull();
  });
  it("calculates sell-through and return rate from active movements", () => {
    expect(
      calculateMetrics([
        { type: "PRODUCTION", quantity: 10, status: "ACTIVE" },
        { type: "SALE", quantity: 6, status: "ACTIVE" },
        { type: "RETURN", quantity: 1, status: "ACTIVE" },
        { type: "SALE", quantity: 3, status: "VOIDED" },
      ]),
    ).toMatchObject({ production: 10, sales: 6, returns: 1, sellThrough: 60, returnRate: 16.7 });
  });
});
