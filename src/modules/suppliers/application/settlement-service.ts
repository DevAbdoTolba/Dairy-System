import { z } from "zod";
import { isIsoDate } from "@/shared/dates/business-date";
import {
  accountMovementSignedPiasters,
  type SupplierAccountMovement,
} from "../domain/account-ledger";
import { milkLineValuePiasters } from "../domain/money";
import { priceForDelivery, type MilkPricePeriod } from "../domain/price";
import { calculateSettlement, type SupplierSettlement } from "../domain/settlement";
import type { MilkEntry } from "../domain/shift";
import {
  getLatestSupplierSettlement,
  getRepaymentInstruction,
  getSettlement,
  getSupplier,
  insertAccountMovement,
  insertSettlement,
  linkAccountMovementsToSettlement,
  linkMilkEntriesToSettlement,
  listMilkPrices,
  listSupplierSettlements,
  listUnsettledAccountMovements,
  listUnsettledMilkEntries,
} from "../infrastructure/repository";
import { withSupplierCommand } from "./command-service";

const settlementPreviewSchema = z.object({
  supplierId: z.string().uuid(),
  cutoffDate: z.string().refine(isIsoDate, "التاريخ غير صحيح."),
});
const settlementConfirmSchema = settlementPreviewSchema.extend({
  commandId: z.string().uuid(),
  settlementId: z.string().uuid(),
  paymentPiasters: z.number().int().min(0).max(1_000_000_000),
});

export type SettlementPreviewInput = z.input<typeof settlementPreviewSchema>;
export type SettlementConfirmInput = z.input<typeof settlementConfirmSchema>;

export class MissingMilkPriceError extends Error {
  constructor(readonly lines: Array<{ businessDate: string; milkType: "COW" | "BUFFALO" }>) {
    super(
      `لا يمكن التسوية قبل تحديد سعر ${lines
        .map(
          (line) =>
            `${line.milkType === "COW" ? "اللبن البقري" : "اللبن الجاموسي"} بتاريخ ${line.businessDate}`,
        )
        .join("، ")}.`,
    );
  }
}

type SettlementSource = {
  supplierId: string;
  cutoffDate: string;
  openingCarryPiasters: number;
  instruction: Awaited<ReturnType<typeof getRepaymentInstruction>>;
  entries: MilkEntry[];
  movements: SupplierAccountMovement[];
  prices: MilkPricePeriod[];
};

async function settlementSource(
  supplierId: string,
  cutoffDate: string,
  session?: Parameters<Parameters<typeof withSupplierCommand>[5]>[0],
): Promise<SettlementSource> {
  const options = session ? { session } : {};
  const [supplier, entries, movements, prices, instruction, previous] = await Promise.all([
    getSupplier(supplierId, options),
    listUnsettledMilkEntries(supplierId, cutoffDate, options),
    listUnsettledAccountMovements(supplierId, cutoffDate, options),
    listMilkPrices(options),
    getRepaymentInstruction(supplierId, options),
    getLatestSupplierSettlement(supplierId, options),
  ]);
  if (!supplier) throw new Error("المورد غير موجود.");
  return {
    supplierId,
    cutoffDate,
    openingCarryPiasters: previous?.closingCarryPiasters ?? 0,
    instruction,
    entries,
    movements,
    prices,
  };
}

function buildPreview(source: SettlementSource, paymentPiasters: number) {
  const missing: Array<{ businessDate: string; milkType: "COW" | "BUFFALO" }> = [];
  const milkLines = source.entries.map((entry) => {
    const price = priceForDelivery(source.prices, entry.milkType, entry.businessDate);
    if (!price) {
      missing.push({ businessDate: entry.businessDate, milkType: entry.milkType });
      return null;
    }
    return {
      entryId: entry.id,
      businessDate: entry.businessDate,
      milkType: entry.milkType,
      quantityQuarterCupUnits: entry.quantityQuarterCupUnits,
      pricePiastersPerSatl: price.pricePiastersPerSatl,
      valuePiasters: milkLineValuePiasters(
        entry.quantityQuarterCupUnits,
        price.pricePiastersPerSatl,
      ),
    };
  });
  if (missing.length > 0) throw new MissingMilkPriceError(missing);
  const snapshotMovements = source.movements.map((movement) => ({
    movementId: movement.id,
    type: movement.type,
    businessDate: movement.businessDate,
    amountPiasters: movement.amountPiasters,
    signedPiasters: accountMovementSignedPiasters(movement),
    note: movement.note,
  }));
  if (milkLines.length === 0 && snapshotMovements.length === 0)
    throw new Error("لا توجد حقائق غير مسواة حتى تاريخ الإغلاق.");
  const holdPayment = Boolean(
    source.instruction?.holdPaymentUntil &&
    source.instruction.holdPaymentUntil >= source.cutoffDate,
  );
  const calculation = calculateSettlement({
    openingCarryPiasters: source.openingCarryPiasters,
    milkLineValuesPiasters: milkLines.map((line) => line?.valuePiasters ?? 0),
    movementSignedPiasters: snapshotMovements.map((movement) => movement.signedPiasters),
    suggestedDeductionPiasters: source.instruction?.suggestedDeductionPiasters ?? 0,
    holdPayment,
    paymentPiasters,
  });
  return {
    supplierId: source.supplierId,
    cutoffDate: source.cutoffDate,
    openingCarryPiasters: source.openingCarryPiasters,
    milkLines: milkLines.filter((line): line is NonNullable<typeof line> => Boolean(line)),
    movements: snapshotMovements,
    suggestedDeductionPiasters: source.instruction?.suggestedDeductionPiasters ?? 0,
    holdPayment,
    ...calculation,
  };
}

export async function previewSupplierSettlement(rawInput: SettlementPreviewInput) {
  const input = settlementPreviewSchema.parse(rawInput);
  const source = await settlementSource(input.supplierId, input.cutoffDate);
  const preview = buildPreview(source, 0);
  return {
    ...preview,
    entryIds: source.entries.map((entry) => entry.id),
    movementIds: source.movements.map((movement) => movement.id),
  };
}

export async function confirmSupplierSettlement(rawInput: SettlementConfirmInput) {
  const input = settlementConfirmSchema.parse(rawInput);
  const result = await withSupplierCommand(
    input.commandId,
    "SUPPLIER_SETTLEMENT_CONFIRMED",
    "SETTLEMENT",
    input.settlementId,
    "OWNER",
    async (session) => {
      const source = await settlementSource(input.supplierId, input.cutoffDate, session);
      const preview = buildPreview(source, input.paymentPiasters);
      const linkedEntries = await linkMilkEntriesToSettlement(
        source.entries.map((entry) => entry.id),
        input.settlementId,
        { session },
      );
      const linkedMovements = await linkAccountMovementsToSettlement(
        source.movements.map((movement) => movement.id),
        input.settlementId,
        { session },
      );
      if (linkedEntries !== source.entries.length || linkedMovements !== source.movements.length)
        throw new Error("تغيرت حقائق الحساب أثناء اعتماد التسوية. أعد المعاينة.");
      const paymentMovementId = input.paymentPiasters > 0 ? input.settlementId : null;
      if (paymentMovementId) {
        await insertAccountMovement(
          {
            id: paymentMovementId,
            supplierId: input.supplierId,
            type: "OWNER_CASH_OUT",
            amountPiasters: input.paymentPiasters,
            businessDate: input.cutoffDate,
            shiftId: null,
            sourceRole: "OWNER",
            ownerReviewStatus: "NOT_REQUIRED",
            note: "دفع تسوية مورد",
            settlementId: input.settlementId,
            createdAt: new Date().toISOString(),
          },
          { session },
        );
      }
      const settlement: SupplierSettlement = {
        id: input.settlementId,
        ...preview,
        paymentPiasters: input.paymentPiasters,
        paymentMovementId,
        createdAt: new Date().toISOString(),
      };
      await insertSettlement(settlement, { session });
      return { settlement };
    },
  );
  return { settlement: result.value.settlement, duplicate: result.duplicate };
}

export async function getSupplierSettlement(id: string) {
  const settlement = await getSettlement(id);
  if (!settlement) throw new Error("التسوية غير موجودة.");
  return settlement;
}

export async function listSettlements(supplierId?: string) {
  return listSupplierSettlements(supplierId);
}
