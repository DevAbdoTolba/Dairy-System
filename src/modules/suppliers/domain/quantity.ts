export const QUARTER_CUP_UNITS_PER_CUP = 4;
export const QUARTER_CUP_UNITS_PER_SATL = 24;
export const CUPS_PER_SATL = QUARTER_CUP_UNITS_PER_SATL / QUARTER_CUP_UNITS_PER_CUP;

export type QuantityParts = {
  satls: number;
  cups: number;
  quarters: number;
};

function assertInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer.`);
}

export function quantityFromParts(parts: QuantityParts) {
  assertInteger(parts.satls, "Satls");
  assertInteger(parts.cups, "Cups");
  assertInteger(parts.quarters, "Quarters");
  if (parts.cups >= CUPS_PER_SATL)
    throw new Error(`Cups must be between 0 and ${CUPS_PER_SATL - 1}.`);
  if (parts.quarters >= QUARTER_CUP_UNITS_PER_CUP)
    throw new Error(`Quarters must be between 0 and ${QUARTER_CUP_UNITS_PER_CUP - 1}.`);
  const units =
    parts.satls * QUARTER_CUP_UNITS_PER_SATL +
    parts.cups * QUARTER_CUP_UNITS_PER_CUP +
    parts.quarters;
  if (units <= 0) throw new Error("Milk quantity must be positive.");
  return units;
}

export function quantityPartsFromUnits(quantityQuarterCupUnits: number): QuantityParts {
  if (!Number.isInteger(quantityQuarterCupUnits) || quantityQuarterCupUnits <= 0)
    throw new Error("Milk quantity must be a positive integer of quarter-cup units.");
  const satls = Math.floor(quantityQuarterCupUnits / QUARTER_CUP_UNITS_PER_SATL);
  const remaining = quantityQuarterCupUnits % QUARTER_CUP_UNITS_PER_SATL;
  return {
    satls,
    cups: Math.floor(remaining / QUARTER_CUP_UNITS_PER_CUP),
    quarters: remaining % QUARTER_CUP_UNITS_PER_CUP,
  };
}

export function formatQuantityArabic(quantityQuarterCupUnits: number) {
  const { satls, cups, quarters } = quantityPartsFromUnits(quantityQuarterCupUnits);
  const pieces: string[] = [];
  if (satls) pieces.push(`${satls} سطل`);
  if (cups) pieces.push(`${cups} كوب`);
  if (quarters) pieces.push(`${quarters}/4 كوب`);
  return pieces.join(" و");
}
