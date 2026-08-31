import { compareSuppliers, type Supplier } from "./supplier";

type TrieSupplier = Pick<
  Supplier,
  "id" | "displayName" | "nameTokens" | "sortOrder" | "sortKey" | "active"
>;

export function suppliersMatchingTokens(suppliers: TrieSupplier[], prefix: string[]) {
  return suppliers
    .filter(
      (supplier) =>
        supplier.active && prefix.every((token, index) => supplier.nameTokens[index] === token),
    )
    .sort(compareSuppliers);
}

export function nextSupplierTokens(suppliers: TrieSupplier[], prefix: string[]) {
  const tokens = new Set<string>();
  for (const supplier of suppliersMatchingTokens(suppliers, prefix)) {
    const next = supplier.nameTokens[prefix.length];
    if (next) tokens.add(next);
  }
  return [...tokens].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
