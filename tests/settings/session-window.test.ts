import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSessionWindowMs } from "../../src/main/settings/session-window";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-sessionwindow-");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MS = 30 * DAY_MS;

function claudeDir(): string {
  const dir = join(makeHome(), ".claude");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeRaw(text: string): string {
  const dir = claudeDir();
  writeFileSync(join(dir, "settings.json"), text);
  return dir;
}

function writeSettings(settings: unknown): string {
  return writeRaw(JSON.stringify(settings));
}

describe("readSessionWindowMs", () => {
  it("defaults to 30 days when settings.json is absent", () => {
    expect(readSessionWindowMs(claudeDir())).toBe(DEFAULT_MS);
  });
  it("defaults when cleanupPeriodDays is absent", () => {
    expect(readSessionWindowMs(writeSettings({}))).toBe(DEFAULT_MS);
  });
  it("converts a valid number of days to ms", () => {
    expect(readSessionWindowMs(writeSettings({ cleanupPeriodDays: 45 }))).toBe(
      45 * DAY_MS,
    );
  });
  it("honors 0 as-is (delete-immediately mirrors disk)", () => {
    expect(readSessionWindowMs(writeSettings({ cleanupPeriodDays: 0 }))).toBe(
      0,
    );
  });
  it("honors a huge value with no cap", () => {
    expect(
      readSessionWindowMs(writeSettings({ cleanupPeriodDays: 3650 })),
    ).toBe(3650 * DAY_MS);
  });
  it("honors fractional days", () => {
    expect(readSessionWindowMs(writeSettings({ cleanupPeriodDays: 0.5 }))).toBe(
      0.5 * DAY_MS,
    );
  });
  it("defaults on a negative value", () => {
    expect(readSessionWindowMs(writeSettings({ cleanupPeriodDays: -5 }))).toBe(
      DEFAULT_MS,
    );
  });
  it("defaults on a numeric string", () => {
    expect(
      readSessionWindowMs(writeSettings({ cleanupPeriodDays: "45" })),
    ).toBe(DEFAULT_MS);
  });
  it("defaults on a null value", () => {
    expect(
      readSessionWindowMs(writeSettings({ cleanupPeriodDays: null })),
    ).toBe(DEFAULT_MS);
  });
  it("defaults on Infinity (JSON 1e999 overflows to Infinity)", () => {
    expect(readSessionWindowMs(writeRaw('{"cleanupPeriodDays": 1e999}'))).toBe(
      DEFAULT_MS,
    );
  });
  it("defaults on malformed JSON", () => {
    expect(readSessionWindowMs(writeRaw("{not json"))).toBe(DEFAULT_MS);
  });
  it("defaults on a non-ENOENT read failure (settings.json is a directory)", () => {
    const dir = claudeDir();
    // Making settings.json a directory makes readFileSync throw EISDIR (not ENOENT),
    // which readTextOrNull re-throws — the reader's catch must turn it into the default.
    mkdirSync(join(dir, "settings.json"));
    expect(readSessionWindowMs(dir)).toBe(DEFAULT_MS);
  });
  it("defaults when settings.json is not an object", () => {
    expect(readSessionWindowMs(writeRaw("null"))).toBe(DEFAULT_MS);
  });
});
