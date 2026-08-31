import type { MilkType } from "./shift";

export type MilkPricePeriod = {
  id: string;
  milkType: MilkType;
  effectiveFrom: string;
  pricePiastersPerSatl: number;
  createdAt: string;
  updatedAt: string;
};

export function priceForDelivery(
  periods: readonly MilkPricePeriod[],
  milkType: MilkType,
  businessDate: string,
) {
  return periods
    .filter((period) => period.milkType === milkType && period.effectiveFrom <= businessDate)
    .sort(
      (left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom) || right.id.localeCompare(left.id),
    )[0];
}
