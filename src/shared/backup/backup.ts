import { z } from "zod";
import { exportDatabase, replaceDatabase } from "@/modules/inventory";

const documentArray = z.array(z.record(z.string(), z.unknown()));
const backupSchema = z.object({
  format: z.literal("dairy-mongodb-export"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    productVariants: documentArray,
    inventoryTransactions: documentArray,
    appSettings: documentArray,
    ownerAccounts: documentArray,
    loginAttempts: documentArray,
  }),
});

export type DairyBackup = {
  format: "dairy-mongodb-export";
  version: 1;
  exportedAt: string;
  data: Awaited<ReturnType<typeof exportDatabase>>;
};

export async function createBackup(): Promise<DairyBackup> {
  return {
    format: "dairy-mongodb-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: await exportDatabase(),
  };
}

export function validateBackup(input: unknown): DairyBackup {
  return backupSchema.parse(input) as DairyBackup;
}

export async function restoreBackup(input: unknown) {
  const backup = validateBackup(input);
  await replaceDatabase(backup.data);
  return backup.exportedAt;
}

export function backupFileName() {
  return `dairy-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
