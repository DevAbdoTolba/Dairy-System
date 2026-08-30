import { predictSuppliers } from "../domain/prediction";
import {
  getShift,
  listAccountMovements,
  listMilkEntries,
  listSupplierVisits,
} from "../infrastructure/repository";
import { listActiveSuppliers } from "./supplier-service";

export type PosBootstrap = {
  posCredentialVersion?: number;
  shift: NonNullable<Awaited<ReturnType<typeof getShift>>>;
  suppliers: Array<{
    id: string;
    displayName: string;
    nameTokens: string[];
    sortOrder: number;
    sortKey: string;
    active: boolean;
    posInstruction: string | null;
    milkTypes: ("COW" | "BUFFALO")[];
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
  cashRecords: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    createdAt: string;
    /** Present only in local durable state; never serialized by the POS API. */
    amountPiasters?: number;
    note?: string;
  }>;
};

export async function getPosBootstrap(shiftId: string): Promise<PosBootstrap> {
  const [shift, suppliers, entries, visits, cashMovements] = await Promise.all([
    getShift(shiftId),
    listActiveSuppliers(),
    listMilkEntries(shiftId),
    listSupplierVisits(),
    listAccountMovements({ shiftId }),
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
      ({ id, displayName, nameTokens, sortOrder, sortKey, active, posInstruction, milkTypes }) => ({
        id,
        displayName,
        nameTokens,
        sortOrder,
        sortKey,
        active,
        posInstruction,
        milkTypes,
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
    cashRecords: cashMovements
      .filter((movement) => movement.type === "POS_CASH_OUT")
      .map((movement) => ({
        id: movement.id,
        supplierId: movement.supplierId,
        supplierName: supplierById.get(movement.supplierId)?.displayName ?? "مورد غير متاح",
        createdAt: movement.createdAt,
      })),
  };
}
