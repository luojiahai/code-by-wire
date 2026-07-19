import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createScanCache } from "../../src/main/util/scan-cache";

describe("createScanCache", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scan-cache-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses once and serves the cached value while (size, mtime) is unchanged", () => {
    const file = join(dir, "a.jsonl");
    writeFileSync(file, "one");
    let parses = 0;
    const cache = createScanCache((text) => {
      parses++;
      return text.toUpperCase();
    });
    expect(cache.read(file)).toBe("ONE");
    expect(cache.read(file)).toBe("ONE");
    expect(parses).toBe(1);
  });

  it("re-parses when the file changes", () => {
    const file = join(dir, "a.jsonl");
    writeFileSync(file, "one");
    let parses = 0;
    const cache = createScanCache((text) => {
      parses++;
      return text;
    });
    cache.read(file);
    writeFileSync(file, "one two"); // size changes → invalidates even if mtime granularity is coarse
    expect(cache.read(file)).toBe("one two");
    expect(parses).toBe(2);
  });

  it("re-parses on an mtime-only change (same size)", () => {
    const file = join(dir, "a.jsonl");
    writeFileSync(file, "one");
    let parses = 0;
    const cache = createScanCache((text) => {
      parses++;
      return text;
    });
    cache.read(file);
    utimesSync(file, new Date(), new Date(Date.now() + 5_000));
    cache.read(file);
    expect(parses).toBe(2);
  });

  it("returns null for a missing file and recovers when it appears", () => {
    const file = join(dir, "missing.jsonl");
    const cache = createScanCache((text) => text);
    expect(cache.read(file)).toBeNull();
    writeFileSync(file, "now");
    expect(cache.read(file)).toBe("now");
  });
});
