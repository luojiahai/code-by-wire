import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createStatusLineReader } from "../../src/main/statusline/reader";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-statusline-");

// A fixed clock just after the default capture mtime, so default captures read as fresh (not pruned).
const NOW_MS = 1_781_000_000 + 1000;
const open = (home: string) =>
  createStatusLineReader({ claudeDir: home, now: () => NOW_MS });

/** Write a capture file into <home>/.flightdeck/statusline/<sid>.json and stamp its mtime. */
function writeCapture(
  home: string,
  sid: string,
  json: unknown,
  mtimeSec = 1_781_000,
): void {
  const dir = join(home, ".flightdeck", "statusline");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sid}.json`);
  writeFileSync(path, JSON.stringify(json));
  utimesSync(path, mtimeSec, mtimeSec);
}

describe("createStatusLineReader", () => {
  it("returns an empty list when nothing has been captured yet (absent dir)", () => {
    const home = makeHome();
    expect(open(home).read()).toEqual([]);
  });

  it("normalizes a subscription capture, converting resets_at seconds to ms", () => {
    const home = makeHome();
    writeCapture(home, "sess-a", {
      session_id: "sess-a",
      cost: {
        total_cost_usd: 0.42,
        total_lines_added: 156,
        total_lines_removed: 23,
      },
      context_window: { used_percentage: 63.7, context_window_size: 200_000 },
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
        seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 },
      },
    });

    const [s] = open(home).read();
    expect(s.sessionId).toBe("sess-a");
    expect(s.costUsd).toBe(0.42);
    expect(s.linesAdded).toBe(156);
    expect(s.linesRemoved).toBe(23);
    expect(s.contextPct).toBe(64); // rounded
    expect(s.contextWindow).toBe(200_000);
    expect(s.rateLimits).toEqual({
      fiveHour: { usedPct: 23.5, resetsAt: 1_738_425_600_000 }, // seconds → ms
      sevenDay: { usedPct: 41.2, resetsAt: 1_738_857_600_000 },
    });
  });

  it("reads an API capture (no rate_limits) as rateLimits: null but still surfaces cost/context", () => {
    const home = makeHome();
    writeCapture(home, "sess-b", {
      session_id: "sess-b",
      cost: { total_cost_usd: 0.01 },
      context_window: { used_percentage: 4, context_window_size: 200_000 },
    });

    const [s] = open(home).read();
    expect(s.rateLimits).toBeNull();
    expect(s.costUsd).toBe(0.01);
    expect(s.contextPct).toBe(4);
  });

  it("degrades missing/mistyped fields to null, never throws", () => {
    const home = makeHome();
    writeCapture(home, "sess-c", {
      session_id: "sess-c",
      cost: { total_cost_usd: "oops" },
    });
    const [s] = open(home).read();
    expect(s.costUsd).toBeNull();
    expect(s.contextPct).toBeNull();
    expect(s.contextWindow).toBeNull();
  });

  it("A2: numeric strings coerce at the trust boundary; junk stays null", () => {
    const home = makeHome();
    writeCapture(home, "s-str", {
      session_id: "s-str",
      cost: {
        total_cost_usd: "1.25",
        total_lines_added: "x",
        total_lines_removed: "",
      },
      context_window_size: undefined,
      context_window: { used_percentage: "85" },
    });
    const s = open(home)
      .read()
      .find((x) => x.sessionId === "s-str");
    expect(s?.costUsd).toBe(1.25);
    expect(s?.contextPct).toBe(85);
    expect(s?.linesAdded).toBeNull();
    expect(s?.linesRemoved).toBeNull();
  });

  it("skips a malformed file and a file with no session id, keeping the good ones", () => {
    const home = makeHome();
    const dir = join(home, ".flightdeck", "statusline");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "broken.json"), "{ not json");
    writeFileSync(
      join(dir, "no-id.json"),
      JSON.stringify({ cost: { total_cost_usd: 1 } }),
    );
    writeCapture(home, "good", {
      session_id: "good",
      cost: { total_cost_usd: 2 },
    });

    const out = open(home).read();
    expect(out.map((s) => s.sessionId)).toEqual(["good"]);
  });

  it("stamps each sample with its file mtime in ms", () => {
    const home = makeHome();
    writeCapture(home, "sess-d", { session_id: "sess-d" }, 1_781_000);
    expect(open(home).read()[0].capturedMtimeMs).toBe(1_781_000_000);
  });

  it("skips files whose top-level JSON is not an object (array or primitive)", () => {
    const home = makeHome();
    const dir = join(home, ".flightdeck", "statusline");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "arr.json"), JSON.stringify([1, 2, 3]));
    writeFileSync(join(dir, "num.json"), JSON.stringify(42));
    writeFileSync(join(dir, "str.json"), JSON.stringify("hello"));
    writeCapture(home, "good", {
      session_id: "good",
      cost: { total_cost_usd: 1 },
    });

    expect(
      open(home)
        .read()
        .map((s) => s.sessionId),
    ).toEqual(["good"]);
  });

  it("treats rate_limits with malformed windows as a subscription with no usable windows", () => {
    const home = makeHome();
    writeCapture(home, "sess-e", {
      session_id: "sess-e",
      rate_limits: { five_hour: "bad", seven_day: { used_percentage: "x" } },
    });
    const [s] = open(home).read();
    expect(s.rateLimits).not.toBeNull(); // rate_limits present ⇒ still the subscription path, not API
    expect(s.rateLimits).toEqual({ fiveHour: undefined, sevenDay: undefined });
  });

  it("prunes a capture older than the staleness window and stops returning it", () => {
    const home = makeHome();
    writeCapture(
      home,
      "stale",
      { session_id: "stale", cost: { total_cost_usd: 9 } },
      1_000_000,
    ); // ~9d before NOW_MS
    writeCapture(home, "fresh", {
      session_id: "fresh",
      cost: { total_cost_usd: 1 },
    }); // default mtime, fresh

    const out = open(home).read();

    expect(out.map((s) => s.sessionId)).toEqual(["fresh"]); // the dead session's capture is gone
    expect(
      existsSync(join(home, ".flightdeck", "statusline", "stale.json")),
    ).toBe(false); // deleted on read
    expect(
      existsSync(join(home, ".flightdeck", "statusline", "fresh.json")),
    ).toBe(true); // live one untouched
  });

  it("captures current_usage, model id/display_name, and session_name", () => {
    const home = makeHome();
    writeCapture(home, "sess-rich", {
      session_id: "sess-rich",
      session_name: "Code review approval",
      model: {
        id: "claude-opus-4-8[1m]",
        display_name: "Opus 4.8 (1M context)",
      },
      context_window: {
        context_window_size: 1_000_000,
        used_percentage: 21,
        current_usage: {
          input_tokens: 2,
          output_tokens: 588,
          cache_creation_input_tokens: 2770,
          cache_read_input_tokens: 203_420,
        },
      },
    });
    const [s] = open(home).read();
    // Context = input + cache_read + cache_creation; output_tokens is not part of the prompt.
    expect(s.liveContext).toEqual({
      input: 2,
      cacheRead: 203_420,
      cacheCreation: 2770,
    });
    expect(s.modelId).toBe("claude-opus-4-8[1m]");
    expect(s.modelDisplayName).toBe("Opus 4.8 (1M context)");
    expect(s.sessionName).toBe("Code review approval");
  });

  it("degrades the new fields to null when absent, malformed, or zero-sum", () => {
    const home = makeHome();
    writeCapture(home, "sess-bare", {
      session_id: "sess-bare",
      session_name: "",
      context_window: {
        current_usage: {
          input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    const [s] = open(home).read();
    expect(s.liveContext).toBeNull(); // zero-sum usage → no context
    expect(s.modelId).toBeNull();
    expect(s.modelDisplayName).toBeNull();
    expect(s.sessionName).toBeNull(); // empty string is "not named"
  });
});

describe("createStatusLineReader — apiDurationMs and pr", () => {
  it("parses total_api_duration_ms and the pr block", () => {
    const home = makeHome();
    writeCapture(home, "sid-pr", {
      session_id: "sid-pr",
      cost: {
        total_duration_ms: 12_270_000,
        total_api_duration_ms: 3_852_000,
      },
      pr: {
        number: 252,
        url: "https://github.com/wilsonwang0713/code-by-wilson/pull/252",
        review_state: "pending",
      },
    });
    const [s] = open(home).read();
    expect(s.apiDurationMs).toBe(3_852_000);
    expect(s.pr).toEqual({
      number: 252,
      url: "https://github.com/wilsonwang0713/code-by-wilson/pull/252",
      reviewState: "pending",
    });
  });

  it("degrades both to null when omitted", () => {
    const home = makeHome();
    writeCapture(home, "sid-bare", { session_id: "sid-bare" });
    const [s] = open(home).read();
    expect(s.apiDurationMs).toBeNull();
    expect(s.pr).toBeNull();
  });

  it("drops a pr block missing number or url; review_state alone is optional", () => {
    const home = makeHome();
    writeCapture(home, "sid-badpr", {
      session_id: "sid-badpr",
      pr: { number: 7 }, // no url — whole block unusable
    });
    writeCapture(home, "sid-nostate", {
      session_id: "sid-nostate",
      pr: { number: 9, url: "https://example.com/pull/9" }, // no review_state — fine
    });
    const byId = new Map(
      open(home)
        .read()
        .map((s) => [s.sessionId, s]),
    );
    expect(byId.get("sid-badpr")?.pr).toBeNull();
    expect(byId.get("sid-nostate")?.pr).toEqual({
      number: 9,
      url: "https://example.com/pull/9",
      reviewState: null,
    });
  });

  it("drops a malformed pr block: non-object, non-numeric number, or empty url", () => {
    const home = makeHome();
    writeCapture(home, "sid-primitive", {
      session_id: "sid-primitive",
      pr: "nope", // not an object at all
    });
    writeCapture(home, "sid-badnumber", {
      session_id: "sid-badnumber",
      pr: { number: "abc", url: "https://example.com/pull/252" }, // number not numeric, even post-A2 string coercion
    });
    writeCapture(home, "sid-emptyurl", {
      session_id: "sid-emptyurl",
      pr: { number: 9, url: "" }, // url present but empty
    });
    const byId = new Map(
      open(home)
        .read()
        .map((s) => [s.sessionId, s]),
    );
    expect(byId.get("sid-primitive")?.pr).toBeNull();
    expect(byId.get("sid-badnumber")?.pr).toBeNull();
    expect(byId.get("sid-emptyurl")?.pr).toBeNull();
  });
});
