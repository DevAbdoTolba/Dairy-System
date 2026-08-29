export type SettlementCalculationInput = {
  openingCarryPiasters: number;
  milkLineValuesPiasters: readonly number[];
  movementSignedPiasters: readonly number[];
  suggestedDeductionPiasters: number;
  holdPayment: boolean;
  paymentPiasters: number;
};

function assertInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

export function calculateSettlement(input: SettlementCalculationInput) {
  assertInteger(input.openingCarryPiasters, "Opening carry");
  assertInteger(input.suggestedDeductionPiasters, "Suggested deduction");
  assertInteger(input.paymentPiasters, "Payment");
  if (input.suggestedDeductionPiasters < 0 || input.paymentPiasters < 0)
    throw new Error("Settlement deductions and payments cannot be negative.");
  const milkTotalPiasters = input.milkLineValuesPiasters.reduce((total, value) => {
    assertInteger(value, "Milk line value");
    return total + value;
  }, 0);
  const movementTotalPiasters = input.movementSignedPiasters.reduce((total, value) => {
    assertInteger(value, "Movement value");
    return total + value;
  }, 0);
  const beforePaymentPiasters =
    input.openingCarryPiasters + milkTotalPiasters + movementTotalPiasters;
  const suggestedPaymentPiasters = input.holdPayment
    ? 0
    : Math.max(0, beforePaymentPiasters - input.suggestedDeductionPiasters);
  return {
    milkTotalPiasters,
    movementTotalPiasters,
    beforePaymentPiasters,
    suggestedPaymentPiasters,
    closingCarryPiasters: beforePaymentPiasters - input.paymentPiasters,
  };
}

export type SupplierSettlement = {
  id: string;
  supplierId: string;
  cutoffDate: string;
  openingCarryPiasters: number;
  milkLines: Array<{
    entryId: string;
    businessDate: string;
    milkType: "COW" | "BUFFALO";
    quantityQuarterCupUnits: number;
    pricePiastersPerSatl: number;
    valuePiasters: number;
  }>;
  movements: Array<{
    movementId: string;
    type: string;
    businessDate: string;
    amountPiasters: number;
    signedPiasters: number;
    note: string | null;
  }>;
  milkTotalPiasters: number;
  movementTotalPiasters: number;
  beforePaymentPiasters: number;
  suggestedDeductionPiasters: number;
  holdPayment: boolean;
  suggestedPaymentPiasters: number;
  paymentPiasters: number;
  paymentMovementId: string | null;
  closingCarryPiasters: number;
  createdAt: string;
};
