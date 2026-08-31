import type { MilkType } from "./shift";

export type Supplier = {
  id: string;
  displayName: string;
  nameTokens: string[];
  sortOrder: number;
  sortKey: string;
  posInstruction: string | null;
  /** Milk that this supplier is allowed to bring to the collection POS. */
  milkTypes: MilkType[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const arabicMarks = /[\u064B-\u065F\u0670]/g;

export function normalizeSupplierName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/ـ/g, "")
    .replace(arabicMarks, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ar-EG");
}

export function supplierNameTokens(displayName: string) {
  const normalized = normalizeSupplierName(displayName);
  if (!normalized) throw new Error("Supplier name is required.");
  return normalized.split(" ");
}

export function stableSupplierSortKey(displayName: string) {
  return supplierNameTokens(displayName).join(" ");
}

export function compareSuppliers(
  left: Pick<Supplier, "sortOrder" | "sortKey" | "id">,
  right: Pick<Supplier, "sortOrder" | "sortKey" | "id">,
) {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  if (left.sortKey !== right.sortKey) return left.sortKey < right.sortKey ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
