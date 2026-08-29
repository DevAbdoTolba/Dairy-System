import { predictSuppliers } from "../domain/prediction";
import { getShift, listMilkEntries, listSupplierVisits } from "../infrastructure/repository";
import { listActiveSuppliers } from "./supplier-service";

export type PosBootstrap = {
  shift: NonNullable<Awaited<ReturnType<typeof getShift>>>;
  suppliers: Array<{
    id: string;
    displayName: string;
    nameTokens: string[];
    sortOrder: number;
    sortKey: string;
    active: boolean;
    posInstruction: string | null;
  }>;
  suggestions: Array<{ id: string; displayName: string; posInstruction: string | null }>;
  entries: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    milkType: "COW" | "BUFFALO";
    quantityQuarterCupUnits: number;
    revision: number;
    createdAt: string;
    deletedAt: string | null;
  }>;
};

export async function getPosBootstrap(shiftId: string): Promise<PosBootstrap> {
  const [shift, suppliers, entries, visits] = await Promise.all([
    getShift(shiftId),
    listActiveSuppliers(),
    listMilkEntries(shiftId),
    listSupplierVisits(),
  ]);
  if (!shift) throw new Error("الوردية غير موجودة.");
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const suggestions = predictSuppliers({
    suppliers,
    visits,
    currentShiftId: shift.id,
    shiftType: shift.type,
    businessDate: shift.businessDate,
    now: new Date().toISOString(),
  });
  return {
    shift,
    suppliers: suppliers.map(
      ({ id, displayName, nameTokens, sortOrder, sortKey, active, posInstruction }) => ({
        id,
        displayName,
        nameTokens,
        sortOrder,
        sortKey,
        active,
        posInstruction,
      }),
    ),
    suggestions: suggestions.map(({ id, displayName, posInstruction }) => ({
      id,
      displayName,
      posInstruction,
    })),
    entries: entries.map((entry) => ({
      id: entry.id,
      supplierId: entry.supplierId,
      supplierName: supplierById.get(entry.supplierId)?.displayName ?? "مورد غير متاح",
      milkType: entry.milkType,
      quantityQuarterCupUnits: entry.quantityQuarterCupUnits,
      revision: entry.revision,
      createdAt: entry.createdAt,
      deletedAt: entry.deletedAt,
    })),
  };
}
