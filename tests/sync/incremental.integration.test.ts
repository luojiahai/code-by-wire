import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { syncSessions } from "../../src/main/sync";
import { migrate, getSessions } from "../../src/main/db/store";
import { openTestDb } from "../helpers/sqlite";
import { tempHomes } from "../helpers/temp-home";

const NOW = 20_000_000_000; // fixed clock (ms), far in the future so fixture mtimes can't drift into range
const WINDOW = 60_000; // 60s recency window

const makeHome = tempHomes("cbw-int-");

function writeSession(
  home: string,
  pid: number,
  id: string,
  cwd: string,
  status: string,
): void {
  mkdirSync(join(home, "sessions"), { recursive: true });
  writeFileSync(
    join(home, "sessions", `${pid}.json`),
    JSON.stringify({ pid, sessionId: id, cwd, status, updatedAt: NOW }),
  );
}
// A two-line transcript with a distinct activity timestamp per id (so freshest-first order is stable).
function writeTranscript(
  home: string,
  proj: string,
  id: string,
  cwd: string,
  activityIso: string,
  mtimeMs: number,
): string {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: "user",
        isMeta: false,
        cwd,
        message: { role: "user", content: `work on ${id}` },
      }),
      JSON.stringify({
        type: "assistant",
        cwd,
        timestamp: activityIso,
        message: {
          role: "assistant",
          model: "claude-opus-4-8",
          usage: {
            input_tokens: 50000,
            output_tokens: 1000,
            cache_read_input_tokens: 30000,
            cache_creation_input_tokens: 2000,
          },
          content: [{ type: "text", text: "ok" }],
        },
      }),
    ].join("\n") + "\n",
  );
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
  return path;
}

describe("incremental sync (real provider, scratch SQLite)", () => {
  it("indexes live + recent-Ended, drops the ancient, is idempotent, and reparses only what changed", () => {
    const home = makeHome();
    // A live session (registry + transcript).
    writeSession(home, 100, "live", "/w/live", "busy");
    const livePath = writeTranscript(
      home,
      "-w-live",
      "live",
      "/w/live",
      "2026-06-09T03:00:00.000Z",
      NOW - 5_000,
    );
    // An Ended session: recent transcript, no registry file (Claude reaped it).
    writeTranscript(
      home,
      "-w-ended",
      "ended",
      "/w/ended",
      "2026-06-09T02:00:00.000Z",
      NOW - 10_000,
    );
    // An ancient transcript outside the window, no registry → must not surface.
    writeTranscript(
      home,
      "-w-old",
      "ancient",
      "/w/old",
      "2026-06-09T01:00:00.000Z",
      NOW - 10 * WINDOW,
    );

    const db = openTestDb();
    migrate(db);
    const base = createClaudeProvider({
      claudeDir: home,
      isPidAlive: (pid) => pid === 100,
      now: () => NOW,
      recentWindowMs: WINDOW,
    });
    // base.summarize is an arrow on a plain object (no `this`); wrapping it in a spy is a deliberate reference.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const summarize = vi.fn(base.summarize);
    const provider = { ...base, summarize };

    // AC1 + AC3 (first pass): both transcript-bearing sessions parsed; recent Ended appears, ancient doesn't.
    const r1 = syncSessions(db, provider);
    expect(r1.parsedIds.sort()).toEqual(["ended", "live"]);
    const byId1 = Object.fromEntries(getSessions(db).map((s) => [s.id, s]));
    expect(byId1["live"].state).toBe("working");
    expect(byId1["ended"].state).toBe("ended");
    expect(byId1["ancient"]).toBeUndefined();
    // AC1: context % and Equivalent API value are computed from the parsed token data.
    expect(byId1["live"].usage).toEqual({
      inputTokens: 50000,
      outputTokens: 1000,
      cacheReadTokens: 30000,
      cacheCreationTokens: 2000,
      cacheCreation5mTokens: 2000,
      cacheCreation1hTokens: 0,
    });
    expect(byId1["live"].contextWindow).toBe(200_000); // every family defaults to the standard 200K
    expect(byId1["live"].contextPct).toBe(41); // (50000 + 30000 + 2000) / 200000, rounded
    expect(byId1["live"].equivApiValueUsd).toBeCloseTo(0.3025); // opus: (50000*5 + 1000*25 + 30000*0.5 + 2000*6.25)/1e6

    // AC2: a second pass with no file changes reparses nothing and leaves the rows identical.
    const before = getSessions(db);
    summarize.mockClear();
    const r2 = syncSessions(db, provider);
    expect(r2.parsedIds).toEqual([]);
    expect(summarize).not.toHaveBeenCalled();
    expect(getSessions(db)).toEqual(before);

    // AC3: touch only the live transcript → only it reparses.
    utimesSync(livePath, new Date(NOW + 5_000), new Date(NOW + 5_000));
    summarize.mockClear();
    const r3 = syncSessions(db, provider);
    expect(r3.parsedIds).toEqual(["live"]);
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it("flips a live session to Ended on the next sync once its process is gone, without reparsing", () => {
    const home = makeHome();
    writeSession(home, 100, "live", "/w/live", "busy");
    writeTranscript(
      home,
      "-w-live",
      "live",
      "/w/live",
      "2026-06-09T03:00:00.000Z",
      NOW - 5_000,
    );

    const db = openTestDb();
    migrate(db);
    let alivePid = 100;
    const provider = createClaudeProvider({
      claudeDir: home,
      isPidAlive: (pid) => pid === alivePid,
      now: () => NOW,
      recentWindowMs: WINDOW,
    });

    syncSessions(db, provider);
    expect(getSessions(db)[0].state).toBe("working");

    // Process exits: pid no longer alive, transcript untouched. Next sync restates it to Ended, no parse.
    alivePid = -1;
    const r = syncSessions(db, provider);
    expect(r.parsedIds).toEqual([]);
    expect(getSessions(db).find((s) => s.id === "live")!.state).toBe("ended");
  });
});
