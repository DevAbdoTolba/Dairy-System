import { compareSuppliers, type Supplier } from "./supplier";
import type { ShiftType } from "./shift";

export type SupplierVisit = {
  supplierId: string;
  shiftId: string;
  shiftType: ShiftType;
  businessDate: string;
  createdAt: string;
};

export function cairoTimeBucket(value: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)),
  );
  return Math.floor(hour / 3);
}

function cairoMonth(value: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      month: "numeric",
    }).format(new Date(value)),
  );
}

function dateBefore(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function predictSuppliers(input: {
  suppliers: Supplier[];
  visits: SupplierVisit[];
  currentShiftId: string;
  shiftType: ShiftType;
  businessDate: string;
  now: string;
}) {
  const bucket = cairoTimeBucket(input.now);
  const month = cairoMonth(input.now);
  const recentSince = dateBefore(input.businessDate, 14);
  const handled = new Set(
    input.visits
      .filter((visit) => visit.shiftId === input.currentShiftId)
      .map((visit) => visit.supplierId),
  );
  return input.suppliers
    .filter((supplier) => supplier.active)
    .map((supplier) => {
      const history = input.visits.filter(
        (visit) => visit.supplierId === supplier.id && visit.shiftId !== input.currentShiftId,
      );
      const sameShift = history.filter((visit) => visit.shiftType === input.shiftType).length;
      const sameBucket = history.filter(
        (visit) =>
          visit.shiftType === input.shiftType && cairoTimeBucket(visit.createdAt) === bucket,
      ).length;
      const sameMonth = history.filter(
        (visit) => visit.shiftType === input.shiftType && cairoMonth(visit.createdAt) === month,
      ).length;
      const recent = history.filter((visit) => visit.businessDate >= recentSince).length;
      return {
        supplier,
        score:
          sameShift * 3 +
          sameBucket * 5 +
          sameMonth * 4 +
          recent * 2 -
          (handled.has(supplier.id) ? 1_000 : 0),
      };
    })
    .sort(
      (left, right) => right.score - left.score || compareSuppliers(left.supplier, right.supplier),
    )
    .slice(0, 3)
    .map(({ supplier }) => supplier);
}
