export const shiftTypes = ["MORNING", "NIGHT"] as const;
export const milkTypes = ["COW", "BUFFALO"] as const;

export type ShiftType = (typeof shiftTypes)[number];
export type MilkType = (typeof milkTypes)[number];
export type ShiftStatus = "OPEN" | "CLOSED";

export type SupplierShift = {
  id: string;
  businessDate: string;
  type: ShiftType;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  closedByRole: "OWNER" | "POS" | null;
  snapshotHash: string | null;
};

export type MilkEntry = {
  id: string;
  shiftId: string;
  supplierId: string;
  milkType: MilkType;
  quantityQuarterCupUnits: number;
  businessDate: string;
  sourceRole: "OWNER" | "POS";
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export class SupplierBusinessRuleError extends Error {}

export function assertOpenShift(shift: Pick<SupplierShift, "status">) {
  if (shift.status !== "OPEN") throw new SupplierBusinessRuleError("لا يمكن تعديل وردية مغلقة.");
}
