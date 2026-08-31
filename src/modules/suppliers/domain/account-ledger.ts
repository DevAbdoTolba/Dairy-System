import type { Role } from "@/modules/auth/domain/role";
import type { MilkType } from "./shift";

export const accountMovementTypes = [
  "POS_CASH_OUT",
  "OWNER_CASH_OUT",
  "GOODS_CHARGE",
  "MANUAL_CREDIT",
  "MANUAL_DEBIT",
] as const;

export type AccountMovementType = (typeof accountMovementTypes)[number];
export type OwnerReviewStatus = "PENDING" | "REVIEWED" | "NOT_REQUIRED";

export type SupplierAccountMovement = {
  id: string;
  supplierId: string;
  milkType: MilkType;
  type: AccountMovementType;
  amountPiasters: number;
  businessDate: string;
  shiftId: string | null;
  sourceRole: Role;
  ownerReviewStatus: OwnerReviewStatus;
  note: string | null;
  settlementId: string | null;
  createdAt: string;
};

export type SupplierRepaymentInstruction = {
  supplierId: string;
  milkType: MilkType;
  suggestedDeductionPiasters: number;
  holdPaymentUntil: string | null;
  note: string | null;
  updatedAt: string;
};

const movementDirections: Record<AccountMovementType, "CREDIT" | "DEBIT"> = {
  POS_CASH_OUT: "DEBIT",
  OWNER_CASH_OUT: "DEBIT",
  GOODS_CHARGE: "DEBIT",
  MANUAL_CREDIT: "CREDIT",
  MANUAL_DEBIT: "DEBIT",
};

export function accountMovementSignedPiasters(movement: SupplierAccountMovement) {
  if (!Number.isSafeInteger(movement.amountPiasters) || movement.amountPiasters <= 0)
    throw new Error("Account movement amount must be a positive integer.");
  return movementDirections[movement.type] === "CREDIT"
    ? movement.amountPiasters
    : -movement.amountPiasters;
}

export function accountTotalPiasters(movements: readonly SupplierAccountMovement[]) {
  return movements.reduce((total, movement) => total + accountMovementSignedPiasters(movement), 0);
}
