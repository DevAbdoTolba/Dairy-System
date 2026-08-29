import { describe, expect, it } from "vitest";
import { calculateSettlement } from "./settlement";

describe("supplier settlement calculation", () => {
  it("keeps a frozen carry and records only the chosen payment", () => {
    const preview = calculateSettlement({
      openingCarryPiasters: 200,
      milkLineValuesPiasters: [1_000, 501],
      movementSignedPiasters: [-700, -100],
      suggestedDeductionPiasters: 500,
      holdPayment: false,
      paymentPiasters: 401,
    });
    expect(preview.milkTotalPiasters).toBe(1_501);
    expect(preview.movementTotalPiasters).toBe(-800);
    expect(preview.beforePaymentPiasters).toBe(901);
    expect(preview.suggestedPaymentPiasters).toBe(401);
    expect(preview.closingCarryPiasters).toBe(500);
  });

  it("allows zero and over-payment without time-based charges", () => {
    expect(
      calculateSettlement({
        openingCarryPiasters: 0,
        milkLineValuesPiasters: [100],
        movementSignedPiasters: [],
        suggestedDeductionPiasters: 0,
        holdPayment: true,
        paymentPiasters: 0,
      }).suggestedPaymentPiasters,
    ).toBe(0);
    expect(
      calculateSettlement({
        openingCarryPiasters: 100,
        milkLineValuesPiasters: [],
        movementSignedPiasters: [],
        suggestedDeductionPiasters: 0,
        holdPayment: false,
        paymentPiasters: 250,
      }).closingCarryPiasters,
    ).toBe(-150);
  });
});
