import { describe, expect, it } from "vitest";
import { assertOpenShift, SupplierBusinessRuleError } from "./shift";

describe("supplier shifts", () => {
  it("allows only open shifts to change", () => {
    expect(() => assertOpenShift({ status: "OPEN" })).not.toThrow();
    expect(() => assertOpenShift({ status: "CLOSED" })).toThrow(SupplierBusinessRuleError);
  });
});
