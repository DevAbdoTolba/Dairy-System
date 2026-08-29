import { describe, expect, it } from "vitest";
import { canonicalJson } from "./snapshot";

describe("shift snapshot canonicalization", () => {
  it("orders object keys deterministically without changing array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: ["second", "first"] } })).toBe(
      '{"a":{"b":["second","first"],"y":2},"z":1}',
    );
  });
});
