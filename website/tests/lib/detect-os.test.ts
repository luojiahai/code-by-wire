import { describe, expect, it } from "vitest";
import { detectPrimaryPlatform } from "../../src/lib/detect-os";

describe("detectPrimaryPlatform", () => {
  it("detects Windows from a Windows user agent", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    expect(detectPrimaryPlatform(ua)).toBe("windows");
  });

  it("detects macOS from a Mac user agent", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    expect(detectPrimaryPlatform(ua)).toBe("macos");
  });

  it("falls back to macOS for an unrecognized user agent", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
    expect(detectPrimaryPlatform(ua)).toBe("macos");
  });
});
