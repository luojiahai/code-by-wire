import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

describe("ClaudeProvider", () => {
  it("exposes capability flags and the incremental sync primitives", () => {
    const provider = createClaudeProvider({
      claudeDir: resolve("tests/fixtures/claude-home"),
      isPidAlive: (pid) => pid === 1001, // only this one is alive
      now: () => Date.parse("2026-06-09T00:00:00.000Z"),
      recentWindowMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(provider.id).toBe("claude");
    expect(provider.capabilities).toEqual({
      canControl: true,
      hasRateLimits: true,
      hasSubagents: true,
    });

    const candidates = provider.listCandidates();
    expect(candidates).toHaveLength(5); // every fixture session surfaces (all registry-backed)
    const live = candidates.find(
      (c) => c.id === "aaaa1111-1111-1111-1111-111111111111",
    )!;
    expect(live.alive).toBe(true); // pid 1001 is the live one

    // summarize the live one → working; force it dead → ended, off the same transcript.
    expect(provider.summarize(live).state).toBe("working");
    expect(provider.summarize({ ...live, alive: false }).state).toBe("ended");
  });
});

describe("ClaudeProvider.readTranscript", () => {
  const provider = createClaudeProvider({
    claudeDir: resolve("tests/fixtures/claude-home"),
  });

  it("reads a session transcript into render-ready events with a change token", () => {
    const read = provider.readTranscript(
      "aaaa1111-1111-1111-1111-111111111111",
    );
    expect(read.status).toBe("changed");
    if (read.status !== "changed") return;
    expect(read.doc.events[0]).toEqual({
      kind: "user",
      text: "Add a login form to the settings page",
    });
    expect(read.doc.waitingReason).toBeNull();
    expect(read.mtimeMs).toBeGreaterThan(0);
  });

  it("surfaces the waiting reason when the tail is an unanswered question", () => {
    const read = provider.readTranscript(
      "dddd4444-4444-4444-4444-444444444444",
    );
    expect(read.status === "changed" && read.doc.waitingReason).toBe(
      "Expand-contract or big-bang?",
    );
  });

  it("reports unchanged (no re-read) when the change token still matches", () => {
    const id = "aaaa1111-1111-1111-1111-111111111111";
    const first = provider.readTranscript(id);
    expect(first.status).toBe("changed");
    if (first.status !== "changed") return;
    const again = provider.readTranscript(id, first.mtimeMs);
    expect(again).toEqual({ status: "unchanged", mtimeMs: first.mtimeMs });
  });

  it("reports absent for a session with no transcript file", () => {
    expect(provider.readTranscript("no-such-session")).toEqual({
      status: "absent",
    });
  });
});

describe("ClaudeProvider managed labelling", () => {
  const claudeDir = resolve("tests/fixtures/claude-home");
  const liveId = "aaaa1111-1111-1111-1111-111111111111";

  it("labels a session Managed when the registry has its id, Observed otherwise", () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      managed: { has: (id) => id === liveId },
    });
    const candidates = provider.listCandidates();
    const otherId = "bbbb2222-2222-2222-2222-222222222222";
    const live = candidates.find((c) => c.id === liveId)!;
    const other = candidates.find((c) => c.id === otherId)!;
    expect(provider.summarize(live).management).toBe("managed");
    expect(provider.summarize(other).management).toBe("observed");
  });

  it("defaults to Observed when no registry is injected", () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
    });
    const live = provider.listCandidates().find((c) => c.id === liveId)!;
    expect(provider.summarize(live).management).toBe("observed");
  });

  it("reverts a previously-Managed snapshot to Observed when the registry no longer has it (restate)", () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      managed: { has: () => false },
    });
    const live = provider.listCandidates().find((c) => c.id === liveId)!;
    const wasManaged = {
      ...provider.summarize(live),
      management: "managed" as const,
    };
    expect(provider.restate(live, wasManaged).management).toBe("observed");
  });
});

describe("ClaudeProvider.resolveAdoptTarget", () => {
  const makeHome = tempHomes("cbw-prov-adopt-");

  it("delegates to the adopt-target resolver: a live registry entry resolves alive + cwd", () => {
    const home = makeHome();
    mkdirSync(join(home, "sessions"), { recursive: true });
    writeFileSync(
      join(home, "sessions", "100.json"),
      JSON.stringify({
        pid: 100,
        sessionId: "sx",
        cwd: "/w/sx",
        status: "busy",
        updatedAt: 1,
      }),
    );
    const provider = createClaudeProvider({
      claudeDir: home,
      isPidAlive: (pid) => pid === 100,
    });
    expect(provider.resolveAdoptTarget("sx")).toEqual({
      alive: true,
      cwd: "/w/sx",
    });
    expect(provider.resolveAdoptTarget("nope")).toBeNull();
  });
});
