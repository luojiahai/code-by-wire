import { describe, expect, it } from "vitest";
import {
  mergeManifests,
  type UpdateManifest,
} from "../../scripts/merge-update-manifests.mts";

function macArm(): UpdateManifest {
  return {
    version: "0.1.12",
    files: [
      { url: "FlightDeck-0.1.12-arm64.dmg", sha512: "ARM_HASH", size: 100 },
    ],
    path: "FlightDeck-0.1.12-arm64.dmg",
    sha512: "ARM_HASH",
    releaseDate: "2026-06-23T01:00:00.000Z",
  };
}

function macX64(): UpdateManifest {
  return {
    version: "0.1.12",
    files: [
      { url: "FlightDeck-0.1.12-x64.dmg", sha512: "X64_HASH", size: 200 },
    ],
    path: "FlightDeck-0.1.12-x64.dmg",
    sha512: "X64_HASH",
    releaseDate: "2026-06-23T02:00:00.000Z",
  };
}

describe("mergeManifests", () => {
  it("lists every arch's file and keeps the primary arch as the top-level path", () => {
    const merged = mergeManifests([macArm(), macX64()], {
      primaryArch: "arm64",
    });
    expect(merged.files.map((f) => f.url)).toEqual([
      "FlightDeck-0.1.12-arm64.dmg",
      "FlightDeck-0.1.12-x64.dmg",
    ]);
    expect(merged.path).toBe("FlightDeck-0.1.12-arm64.dmg");
    expect(merged.sha512).toBe("ARM_HASH");
  });

  it("uses the newest releaseDate", () => {
    const merged = mergeManifests([macArm(), macX64()], {
      primaryArch: "arm64",
    });
    expect(merged.releaseDate).toBe("2026-06-23T02:00:00.000Z");
  });

  it("selects x64 as primary for Windows", () => {
    const winX64: UpdateManifest = {
      version: "0.1.12",
      files: [{ url: "FlightDeck-0.1.12-x64.exe", sha512: "WX", size: 1 }],
      path: "FlightDeck-0.1.12-x64.exe",
      sha512: "WX",
      releaseDate: "2026-06-23T01:00:00.000Z",
    };
    const winArm: UpdateManifest = {
      version: "0.1.12",
      files: [{ url: "FlightDeck-0.1.12-arm64.exe", sha512: "WA", size: 1 }],
      path: "FlightDeck-0.1.12-arm64.exe",
      sha512: "WA",
      releaseDate: "2026-06-23T01:00:00.000Z",
    };
    const merged = mergeManifests([winX64, winArm], { primaryArch: "x64" });
    expect(merged.path).toBe("FlightDeck-0.1.12-x64.exe");
    expect(merged.files).toHaveLength(2);
  });

  it("throws when versions disagree", () => {
    const b = { ...macX64(), version: "0.1.13" };
    expect(() =>
      mergeManifests([macArm(), b], { primaryArch: "arm64" }),
    ).toThrow(/version mismatch/);
  });

  it("falls back to the first file when the primary arch is absent", () => {
    const merged = mergeManifests([macArm(), macX64()], {
      primaryArch: "riscv",
    });
    expect(merged.path).toBe("FlightDeck-0.1.12-arm64.dmg");
  });
});
