import { describe, expect, it } from "vitest";
import {
  QUARTER_CUP_UNITS_PER_CUP,
  QUARTER_CUP_UNITS_PER_SATL,
  quantityFromParts,
  quantityPartsFromUnits,
} from "./quantity";

describe("supplier milk quantity", () => {
  it("uses exact quarter-cup units", () => {
    expect(QUARTER_CUP_UNITS_PER_CUP).toBe(4);
    expect(QUARTER_CUP_UNITS_PER_SATL).toBe(24);
    expect(quantityFromParts({ satls: 1, cups: 0, quarters: 0 })).toBe(24);
    expect(quantityFromParts({ satls: 0, cups: 1, quarters: 0 })).toBe(4);
    expect(quantityFromParts({ satls: 2, cups: 0, quarters: 0 })).toBe(48);
    expect(2 * QUARTER_CUP_UNITS_PER_SATL - QUARTER_CUP_UNITS_PER_CUP).toBe(44);
    expect(quantityFromParts({ satls: 1, cups: 3, quarters: 0 })).toBe(36);
    expect(2 * QUARTER_CUP_UNITS_PER_SATL - 1).toBe(47);
  });

  it("normalizes units and rejects imprecise or non-positive input", () => {
    expect(quantityPartsFromUnits(47)).toEqual({ satls: 1, cups: 5, quarters: 3 });
    expect(() => quantityFromParts({ satls: 0, cups: 0, quarters: 0 })).toThrow(/positive/i);
    expect(() => quantityFromParts({ satls: 1, cups: 6, quarters: 0 })).toThrow(/cups/i);
    expect(() => quantityPartsFromUnits(1.5)).toThrow(/integer/i);
  });
});
