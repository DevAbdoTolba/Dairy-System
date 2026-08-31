import { QUARTER_CUP_UNITS_PER_SATL } from "./quantity";

export const PIASTERS_PER_EGP = 100;

function assertInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

export function milkLineValuePiasters(
  quantityQuarterCupUnits: number,
  pricePiastersPerSatl: number,
) {
  assertInteger(quantityQuarterCupUnits, "Milk quantity");
  assertInteger(pricePiastersPerSatl, "Milk price");
  if (quantityQuarterCupUnits <= 0) throw new Error("Milk quantity must be positive.");
  if (pricePiastersPerSatl < 0) throw new Error("Milk price cannot be negative.");
  return Math.floor(
    (quantityQuarterCupUnits * pricePiastersPerSatl + QUARTER_CUP_UNITS_PER_SATL / 2) /
      QUARTER_CUP_UNITS_PER_SATL,
  );
}

export function signedPiasters(amountPiasters: number, direction: "CREDIT" | "DEBIT") {
  assertInteger(amountPiasters, "Amount");
  if (amountPiasters < 0) throw new Error("Amount must be positive or zero.");
  return direction === "CREDIT" ? amountPiasters : -amountPiasters;
}

export function formatPiasters(value: number) {
  assertInteger(value, "Amount");
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / PIASTERS_PER_EGP);
}
