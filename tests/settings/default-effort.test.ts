import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDefaultEffort } from "../../src/main/settings/default-effort";

describe("readDefaultEffort (A6 settings fallback)", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("reads settings.json effortLevel; absent/malformed → null", () => {
    dir = mkdtempSync(join(tmpdir(), "cbw-effort-"));
    expect(readDefaultEffort(dir)).toBeNull(); // no file
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ effortLevel: "high" }),
    );
    expect(readDefaultEffort(dir)).toBe("high");
    writeFileSync(join(dir, "settings.json"), "{broken");
    expect(readDefaultEffort(dir)).toBeNull();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ effortLevel: 3 }),
    );
    expect(readDefaultEffort(dir)).toBeNull();
  });
});
