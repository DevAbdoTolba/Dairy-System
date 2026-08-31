import { z } from "zod";
import { exportDatabase, replaceDatabase, replaceInventoryDatabase } from "@/modules/inventory";
import {
  exportSupplierDatabase,
  replaceSupplierDatabase,
  type SupplierBackupData,
} from "@/modules/suppliers";
import { withMongoTransaction } from "@/shared/db";

const documentArray = z.array(z.record(z.string(), z.unknown()));
const inventoryDataSchema = z.object({
  productVariants: documentArray,
  inventoryTransactions: documentArray,
  appSettings: documentArray,
  ownerAccounts: documentArray,
  loginAttempts: documentArray,
});
const supplierDataSchema = z.object({
  suppliers: documentArray,
  supplierShifts: documentArray,
  supplierShiftAliases: documentArray,
  supplierMilkEntries: documentArray,
  supplierMilkPrices: documentArray,
  supplierAccountMovements: documentArray,
  supplierRepaymentInstructions: documentArray,
  supplierSettlements: documentArray,
  supplierEvents: documentArray,
  posAccounts: documentArray,
});
const baseSchema = z.object({
  format: z.literal("dairy-mongodb-export"),
  exportedAt: z.string().datetime(),
});
const backupV1Schema = baseSchema.extend({ version: z.literal(1), data: inventoryDataSchema });
const backupV2Schema = baseSchema.extend({
  version: z.literal(2),
  data: z.object({ inventory: inventoryDataSchema, suppliers: supplierDataSchema }),
});
const backupSchema = z.union([backupV1Schema, backupV2Schema]);

type InventoryBackupData = Awaited<ReturnType<typeof exportDatabase>>;
export type DairyBackupV1 = {
  format: "dairy-mongodb-export";
  version: 1;
  exportedAt: string;
  data: InventoryBackupData;
};
export type DairyBackupV2 = {
  format: "dairy-mongodb-export";
  version: 2;
  exportedAt: string;
  data: { inventory: InventoryBackupData; suppliers: SupplierBackupData };
};
export type DairyBackup = DairyBackupV1 | DairyBackupV2;

export async function createBackup(): Promise<DairyBackupV2> {
  const [inventory, suppliers] = await Promise.all([exportDatabase(), exportSupplierDatabase()]);
  return {
    format: "dairy-mongodb-export",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { inventory, suppliers },
  };
}

export function validateBackup(input: unknown): DairyBackup {
  return backupSchema.parse(input) as DairyBackup;
}

export async function restoreBackup(input: unknown) {
  const backup = validateBackup(input);
  if (backup.version === 1) {
    await replaceDatabase(backup.data as InventoryBackupData);
    return { exportedAt: backup.exportedAt, legacy: true };
  }
  await withMongoTransaction(async (session) => {
    await replaceInventoryDatabase(backup.data.inventory as InventoryBackupData, session);
    await replaceSupplierDatabase(backup.data.suppliers as SupplierBackupData, session);
  });
  return { exportedAt: backup.exportedAt, legacy: false };
}

export function backupFileName() {
  return `dairy-backup-v2-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
