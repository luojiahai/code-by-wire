import { describe, it, expect } from "vitest";
import { isMacPlatform } from "../src/shared/platform";

describe("isMacPlatform", () => {
  it("is true only for darwin", () => {
    expect(isMacPlatform("darwin")).toBe(true);
    expect(isMacPlatform("win32")).toBe(false);
    expect(isMacPlatform("linux")).toBe(false);
    expect(isMacPlatform("")).toBe(false);
  });
});
