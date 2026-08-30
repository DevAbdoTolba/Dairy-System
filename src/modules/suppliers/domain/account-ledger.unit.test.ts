import { describe, expect, it } from "vitest";
import {
  accountMovementSignedPiasters,
  accountTotalPiasters,
  type SupplierAccountMovement,
} from "./account-ledger";

const movement = (type: SupplierAccountMovement["type"]): SupplierAccountMovement => ({
  id: type,
  supplierId: "supplier-id",
  milkType: "COW",
  type,
  amountPiasters: 700,
  businessDate: "2026-08-29",
  shiftId: null,
  sourceRole: "OWNER",
  ownerReviewStatus: "NOT_REQUIRED",
  note: null,
  settlementId: null,
  createdAt: "2026-08-29T00:00:00.000Z",
});

describe("supplier principal ledger", () => {
  it("uses an explicit sign map and permits a negative balance", () => {
    expect(accountMovementSignedPiasters(movement("MANUAL_CREDIT"))).toBe(700);
    expect(accountMovementSignedPiasters(movement("MANUAL_DEBIT"))).toBe(-700);
    expect(accountMovementSignedPiasters(movement("POS_CASH_OUT"))).toBe(-700);
    expect(accountMovementSignedPiasters(movement("GOODS_CHARGE"))).toBe(-700);
    expect(accountTotalPiasters([movement("POS_CASH_OUT")])).toBe(-700);
  });

  it("has no interest, time charge, or automatic repayment behavior", () => {
    const total = accountTotalPiasters([movement("MANUAL_CREDIT"), movement("OWNER_CASH_OUT")]);
    expect(total).toBe(0);
  });
});
