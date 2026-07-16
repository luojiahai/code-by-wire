import { describe, it, expect } from "vitest";
import { isMacPlatform, osKind, toPosixPath } from "../src/shared/platform";

describe("isMacPlatform", () => {
  it("is true only for darwin", () => {
    expect(isMacPlatform("darwin")).toBe(true);
    expect(isMacPlatform("win32")).toBe(false);
    expect(isMacPlatform("linux")).toBe(false);
    expect(isMacPlatform("")).toBe(false);
  });
});

describe("osKind", () => {
  it("maps platform strings to their OS family, defaulting unixes to linux", () => {
    expect(osKind("darwin")).toBe("mac");
    expect(osKind("win32")).toBe("windows");
    expect(osKind("linux")).toBe("linux");
    expect(osKind("freebsd")).toBe("linux");
  });
});

describe("toPosixPath", () => {
  it("rewrites backslashes to forward slashes", () => {
    expect(toPosixPath("C:\\Users\\me\\AppData\\Roaming\\npm")).toBe(
      "C:/Users/me/AppData/Roaming/npm",
    );
  });
  it("leaves a posix path unchanged", () => {
    expect(toPosixPath("/usr/local/bin/claude")).toBe("/usr/local/bin/claude");
  });
});
