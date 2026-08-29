import { describe, expect, it } from "vitest";
import { formatPiasters, milkLineValuePiasters, signedPiasters } from "./money";

describe("supplier money", () => {
  it("values every milk line using integer half-up rounding", () => {
    expect(milkLineValuePiasters(24, 1_000)).toBe(1_000);
    expect(milkLineValuePiasters(12, 1_001)).toBe(501);
    expect(milkLineValuePiasters(1, 12)).toBe(1);
    expect(milkLineValuePiasters(1, 11)).toBe(0);
  });

  it("keeps money as integer piasters and formats it for the owner", () => {
    expect(() => milkLineValuePiasters(1.5, 100)).toThrow(/integer/i);
    expect(signedPiasters(500, "CREDIT")).toBe(500);
    expect(signedPiasters(500, "DEBIT")).toBe(-500);
    expect(formatPiasters(-1_250)).toContain("١٢");
  });
});
