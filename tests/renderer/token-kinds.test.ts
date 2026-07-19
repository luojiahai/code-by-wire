import { describe, expect, it } from "vitest";
import {
  CORE_TOKEN_KINDS,
  TOKEN_KINDS,
} from "../../src/renderer/src/ui/token-kinds";

describe("token kinds", () => {
  it("full set stays the five Claude kinds in fresh→cached order", () => {
    expect(TOKEN_KINDS.map((k) => k.key)).toEqual([
      "input",
      "output",
      "cacheRead",
      "cacheWrite5m",
      "cacheWrite1h",
    ]);
  });

  it("core set is input/output/cacheRead — no cache-write rows", () => {
    expect(CORE_TOKEN_KINDS.map((k) => k.key)).toEqual([
      "input",
      "output",
      "cacheRead",
    ]);
  });

  it("core set is an order-preserving subset of the full set (same objects)", () => {
    expect(CORE_TOKEN_KINDS).toEqual(
      TOKEN_KINDS.filter((k) => CORE_TOKEN_KINDS.includes(k)),
    );
  });
});
