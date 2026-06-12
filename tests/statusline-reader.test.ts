import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { createStatusLineReader } from "../src/main/statusline/reader";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-slreader-");
const NOW = 1_781_000_000_000;

/** Write one capture JSON into <home>/.code-by-wire/statusline/<sid>.json with a fresh mtime. */
function writeCapture(home: string, sid: string, json: unknown): void {
  const dir = join(home, ".code-by-wire", "statusline");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sid}.json`);
  writeFileSync(path, JSON.stringify(json));
  const t = NOW / 1000;
  utimesSync(path, t, t);
}

describe("createStatusLineReader — new fields", () => {
  it("parses version, effort, cwd, session clock, and the weekly sub-buckets", () => {
    const home = makeHome();
    writeCapture(home, "sid-1", {
      session_id: "sid-1",
      version: "2.0.14",
      effort: { level: "high" },
      cwd: "/Users/me/proj",
      cost: { total_cost_usd: 4.21, total_duration_ms: 6_120_000 },
      context_window: { used_percentage: 62, context_window_size: 200_000 },
      model: { id: "claude-opus-4-8[1m]", display_name: "Opus 4.8" },
      rate_limits: {
        five_hour: { used_percentage: 41, resets_at: NOW / 1000 + 8280 },
        seven_day: { used_percentage: 68, resets_at: NOW / 1000 + 273_600 },
        seven_day_sonnet: {
          used_percentage: 52,
          resets_at: NOW / 1000 + 273_600,
        },
        seven_day_opus: {
          used_percentage: 81,
          resets_at: NOW / 1000 + 273_600,
        },
      },
    });
    const [s] = createStatusLineReader({
      claudeDir: home,
      now: () => NOW,
    }).read();
    expect(s.version).toBe("2.0.14");
    expect(s.effortLevel).toBe("high");
    expect(s.cwd).toBe("/Users/me/proj");
    expect(s.sessionClockMs).toBe(6_120_000);
    expect(s.rateLimits?.sevenDaySonnet?.usedPct).toBe(52);
    expect(s.rateLimits?.sevenDayOpus?.usedPct).toBe(81);
  });

  it("degrades each new field to null when omitted, never throws", () => {
    const home = makeHome();
    writeCapture(home, "sid-2", { session_id: "sid-2" });
    const [s] = createStatusLineReader({
      claudeDir: home,
      now: () => NOW,
    }).read();
    expect(s.version).toBeNull();
    expect(s.effortLevel).toBeNull();
    expect(s.cwd).toBeNull();
    expect(s.sessionClockMs).toBeNull();
    expect(s.rateLimits).toBeNull();
  });

  it("reads cwd from workspace.current_dir when top-level cwd is absent", () => {
    const home = makeHome();
    writeCapture(home, "sid-3", {
      session_id: "sid-3",
      workspace: { current_dir: "/ws/dir" },
    });
    const [s] = createStatusLineReader({
      claudeDir: home,
      now: () => NOW,
    }).read();
    expect(s.cwd).toBe("/ws/dir");
  });
});
