import crypto from "node:crypto";
import { z } from "zod";
import {
  getSupplier,
  insertSupplier,
  listSuppliers,
  nextSupplierSortOrder,
  updateSupplier,
} from "../infrastructure/repository";
import { stableSupplierSortKey, supplierNameTokens, type Supplier } from "../domain/supplier";

const supplierInputSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  posInstruction: z.string().trim().max(500).optional().default(""),
});

export type SupplierInput = z.input<typeof supplierInputSchema>;

function supplierFields(input: SupplierInput) {
  const parsed = supplierInputSchema.parse(input);
  return {
    displayName: parsed.displayName,
    nameTokens: supplierNameTokens(parsed.displayName),
    sortKey: stableSupplierSortKey(parsed.displayName),
    posInstruction: parsed.posInstruction || null,
  };
}

export async function createSupplier(input: SupplierInput) {
  const timestamp = new Date().toISOString();
  const supplier: Supplier = {
    id: crypto.randomUUID(),
    ...supplierFields(input),
    sortOrder: await nextSupplierSortOrder(),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return insertSupplier(supplier);
}

export async function editSupplier(id: string, input: SupplierInput) {
  const existing = await getSupplier(id);
  if (!existing) throw new Error("المورد غير موجود.");
  return updateSupplier(id, {
    ...supplierFields(input),
    active: existing.active,
    updatedAt: new Date().toISOString(),
  });
}

export async function setSupplierActive(id: string, active: boolean) {
  const existing = await getSupplier(id);
  if (!existing) throw new Error("المورد غير موجود.");
  return updateSupplier(id, {
    displayName: existing.displayName,
    nameTokens: existing.nameTokens,
    sortKey: existing.sortKey,
    posInstruction: existing.posInstruction,
    active,
    updatedAt: new Date().toISOString(),
  });
}

export async function listOwnerSuppliers() {
  return listSuppliers();
}

export async function listActiveSuppliers() {
  return listSuppliers({ active: true });
}
