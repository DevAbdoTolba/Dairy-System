import { MongoServerError } from "mongodb";
import type { Role } from "@/modules/auth/domain/role";
import { withMongoTransaction } from "@/shared/db";
import { getSupplierEvent, insertSupplierEvent } from "../infrastructure/repository";

export type SupplierAggregateType =
  "SUPPLIER" | "SHIFT" | "MILK_ENTRY" | "PRICE" | "ACCOUNT_MOVEMENT" | "SETTLEMENT";

export async function withSupplierCommand<T>(
  commandId: string,
  kind: string,
  aggregateType: SupplierAggregateType,
  aggregateId: string,
  actorRole: Role,
  operation: (session: Parameters<Parameters<typeof withMongoTransaction>[0]>[0]) => Promise<T>,
) {
  const existing = await getSupplierEvent(commandId);
  if (existing) return { value: existing.result as T, duplicate: true };
  try {
    return await withMongoTransaction(async (session) => {
      const repeated = await getSupplierEvent(commandId, { session });
      if (repeated) return { value: repeated.result as T, duplicate: true };
      const value = await operation(session);
      await insertSupplierEvent(
        {
          _id: commandId,
          kind,
          aggregateType,
          aggregateId,
          actorRole,
          result: value,
          createdAt: new Date().toISOString(),
        },
        { session },
      );
      return { value, duplicate: false };
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const repeated = await getSupplierEvent(commandId);
      if (repeated) return { value: repeated.result as T, duplicate: true };
    }
    throw error;
  }
}
