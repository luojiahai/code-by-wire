import { describe, it, expect } from "vitest";
import { cpSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import { createCodexProvider } from "../../src/main/provider/codex";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-codex-prov-");

const NOW = Date.parse("2026-07-12T00:00:00.000Z");
const FULL = "cccc1111-1111-4111-8111-111111111111";
const META_ONLY = "cccc2222-2222-4222-8222-222222222222";

const FULL_PATH = [
  "sessions/2026/07/10",
  `rollout-2026-07-10T10-00-00-${FULL}.jsonl`,
].join("/");
const META_PATH = [
  "sessions/2026/07/11",
  `rollout-2026-07-11T09-00-00-${META_ONLY}.jsonl`,
].join("/");

/** A copy of the fixture home with controlled mtimes: the full session appended 10s ago (live by
 *  the heuristic), the meta-only one hours ago (ended). Copied so pinning mtimes never dirties the
 *  checked-in fixtures. */
function fixtureHome(): string {
  const home = makeHome();
  cpSync(resolve("tests/fixtures/codex-home"), home, { recursive: true });
  utimesSync(
    join(home, FULL_PATH),
    (NOW - 10_000) / 1000,
    (NOW - 10_000) / 1000,
  );
  utimesSync(
    join(home, META_PATH),
    (NOW - 2 * 3600_000) / 1000,
    (NOW - 2 * 3600_000) / 1000,
  );
  return home;
}

function provider(home: string) {
  return createCodexProvider({ codexDir: home, now: () => NOW });
}

describe("CodexProvider", () => {
  it("exposes the observe-only capability flags", () => {
    const p = provider(fixtureHome());
    expect(p.id).toBe("codex");
    expect(p.capabilities).toEqual({
      canControl: false,
      hasRateLimits: false,
      hasSubagents: false,
    });
  });

  it("lists recent rollouts only, with mtime-derived liveness", () => {
    const p = provider(fixtureHome());
    const byId = new Map(p.listCandidates().map((c) => [c.id, c]));
    // The 2026/01/01 fixture is outside the window — bounded discovery never surfaces it.
    expect([...byId.keys()].sort()).toEqual([FULL, META_ONLY]);
    expect(byId.get(FULL)?.alive).toBe(true);
    expect(byId.get(META_ONLY)?.alive).toBe(false);
  });

  it("summarizes a rollout: index title, session_meta identity, usage, real context window", () => {
    const p = provider(fixtureHome());
    const byId = new Map(p.listCandidates().map((c) => [c.id, c]));
    const s = p.summarize(byId.get(FULL)!);

    expect(s.title).toBe("Demo health endpoint"); // session_index.jsonl thread_name wins
    expect(s.project).toBe("demo-app");
    expect(s.cwd).toBe("/Users/tester/demo-app");
    expect(s.branch).toBe("main");
    expect(s.management).toBe("observed");
    expect(s.state).toBe("working"); // fresh mtime → live → working (see stateOf)
    expect(s.modelRaw).toBe("gpt-5.5");
    expect(s.effortLevel).toBe("high");
    expect(s.usage).toMatchObject({
      inputTokens: 1000,
      outputTokens: 250,
      cacheReadTokens: 4000,
    });
    expect(s.usageByModel).toEqual([{ modelRaw: "gpt-5.5", usage: s.usage }]);
    expect(s.contextTokens).toBe(5000);
    expect(s.contextWindow).toBe(272000);
    expect(s.awaitingUser).toBe(false);
  });

  it("summarizes a session_meta-only rollout and restates ended off a stale mtime", () => {
    const p = provider(fixtureHome());
    const byId = new Map(p.listCandidates().map((c) => [c.id, c]));
    const s = p.summarize(byId.get(META_ONLY)!);

    expect(s.title).toBe("Meta only session");
    expect(s.project).toBe("notes");
    expect(s.state).toBe("ended");
    expect(s.usage.inputTokens).toBe(0);
    expect(s.modelRaw).toBeUndefined();

    // restate: liveness re-derives from the fresh candidate without reparsing.
    expect(p.restate({ ...byId.get(META_ONLY)!, alive: true }, s).state).toBe(
      "working",
    );
  });

  it("reads the transcript with a change token and answers unchanged on an un-moved file", () => {
    const p = provider(fixtureHome());
    const read = p.readTranscript(FULL);
    expect(read.status).toBe("changed");
    if (read.status !== "changed") return;
    expect(read.doc.events[0]).toEqual({
      kind: "user",
      text: "Add a health endpoint to the demo server",
    });
    expect(read.doc.subagents).toEqual([]);
    expect(p.readTranscript(FULL, read.mtimeMs)).toEqual({
      status: "unchanged",
      mtimeMs: read.mtimeMs,
    });
  });

  it("serves a tool call's full detail and the session cwd on demand", () => {
    const p = provider(fixtureHome());
    expect(p.getToolResult(FULL, "call_demo_1")).toMatchObject({
      found: true,
      status: "ok",
    });
    expect(p.resolveSessionCwd(FULL)).toBe("/Users/tester/demo-app");
    expect(p.resolveAdoptTarget(FULL)).toBeNull(); // observe-only: nothing is adoptable
  });

  it("answers absent for surfaces a rollout doesn't have", () => {
    const p = provider(fixtureHome());
    expect(p.readTranscript("not-a-session")).toEqual({ status: "absent" });
    expect(p.readTasks(FULL)).toEqual({ status: "absent" });
    expect(p.readShells(FULL)).toEqual({ status: "absent" });
    expect(p.readMonitors(FULL)).toEqual({ status: "absent" });
    expect(p.readMetrics(FULL)).toEqual({ status: "absent" });
    expect(p.readSubagentTranscript(FULL, "agent-1")).toEqual({
      status: "absent",
    });
  });

  it("contributes zero sessions and zero errors without a ~/.codex", () => {
    const p = provider(join(makeHome(), "missing"));
    expect(p.listCandidates()).toEqual([]);
    expect(p.readTranscript(FULL)).toEqual({ status: "absent" });
  });
});
