export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export type ShiftCloseSnapshotPayload = {
  version: 1;
  shift: {
    id: string;
    businessDate: string;
    type: "MORNING" | "NIGHT";
  };
  entries: Array<{
    id: string;
    supplierId: string;
    milkType: "COW" | "BUFFALO";
    quantityQuarterCupUnits: number;
    revision: number;
    createdAt?: string;
    updatedAt?: string;
    deletedAt: string | null;
  }>;
  /**
   * Every cash id visible in the local timeline. Older snapshots only have
   * these ids; newer snapshots also retain a complete recovery envelope below.
   */
  cashRecordIds: string[];
  cashRecords?: Array<{
    id: string;
    supplierId: string;
    milkType: "COW" | "BUFFALO";
    amountPiasters: number;
    note: string;
    createdAt: string;
  }>;
  closedAt: string;
};

export type ShiftCloseSnapshot = {
  payload: ShiftCloseSnapshotPayload;
  checksum: string;
};
