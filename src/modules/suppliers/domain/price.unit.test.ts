import { describe, expect, it } from "vitest";
import { priceForDelivery, type MilkPricePeriod } from "./price";

const periods: MilkPricePeriod[] = [
  {
    id: "cow-old",
    milkType: "COW",
    effectiveFrom: "2026-01-01",
    pricePiastersPerSatl: 1_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cow-new",
    milkType: "COW",
    effectiveFrom: "2026-02-01",
    pricePiastersPerSatl: 1_200,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
];

describe("historical milk price", () => {
  it("uses the newest effective price at or before the delivery date", () => {
    expect(priceForDelivery(periods, "COW", "2026-01-31")?.id).toBe("cow-old");
    expect(priceForDelivery(periods, "COW", "2026-02-01")?.id).toBe("cow-new");
    expect(priceForDelivery(periods, "BUFFALO", "2026-02-01")).toBeUndefined();
    expect(priceForDelivery(periods, "COW", "2025-12-31")).toBeUndefined();
  });
});
