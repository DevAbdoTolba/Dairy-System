import { describe, expect, it } from "vitest";
import { canAccessOwnerArea, canAccessPosArea, isRole, roles } from "./role";

describe("authentication roles", () => {
  it("accepts only the two supported roles", () => {
    expect(roles).toEqual(["OWNER", "POS"]);
    expect(isRole("OWNER")).toBe(true);
    expect(isRole("POS")).toBe(true);
    expect(isRole("ADMIN")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("keeps owner-only and POS-capable access distinct", () => {
    expect(canAccessOwnerArea("OWNER")).toBe(true);
    expect(canAccessOwnerArea("POS")).toBe(false);
    expect(canAccessPosArea("OWNER")).toBe(true);
    expect(canAccessPosArea("POS")).toBe(true);
  });
});
