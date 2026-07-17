import { describe, it, expect } from "vitest";
import { isPreTahoeMacOS } from "../../src/main/dock-icon";

describe("isPreTahoeMacOS", () => {
  it("returns true for pre-Tahoe Darwin releases (macOS <=15, Sequoia and earlier)", () => {
    expect(isPreTahoeMacOS("24.6.0")).toBe(true);
  });

  it("returns false for Tahoe's own Darwin release", () => {
    expect(isPreTahoeMacOS("25.5.0")).toBe(false);
  });

  it("returns false for a future post-Tahoe Darwin release", () => {
    expect(isPreTahoeMacOS("26.0.0")).toBe(false);
  });

  it("returns false (no-op) for an unparseable release string", () => {
    expect(isPreTahoeMacOS("not-a-version")).toBe(false);
  });
});
