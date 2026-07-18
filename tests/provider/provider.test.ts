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

describe("ClaudeProvider managed model", () => {
  const makeHome = tempHomes("cbw-prov-model-");

  // Stand up a managed session whose transcript holds only a user turn — no assistant turn has landed,
  // so no real model string is recorded yet. This is the window right after the first prompt is sent.
  function homeWithModellessSession(id: string): string {
    const home = makeHome();
    mkdirSync(join(home, "sessions"), { recursive: true });
    writeFileSync(
      join(home, "sessions", `${id}.json`),
      JSON.stringify({
        pid: 100,
        sessionId: id,
        cwd: "/w/proj",
        status: "busy",
        updatedAt: 1,
      }),
    );
    const proj = join(home, "projects", "-w-proj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(
      join(proj, `${id}.jsonl`),
      JSON.stringify({
        type: "user",
        cwd: "/w/proj",
        timestamp: "2026-06-09T00:00:00.000Z",
        message: { role: "user", content: "hello" },
      }) + "\n",
    );
    return home;
  }

  it("fronts the registry's picked model while the transcript has recorded no real model yet", () => {
    const id = "ffff5555-5555-5555-5555-555555555555";
    const provider = createClaudeProvider({
      claudeDir: homeWithModellessSession(id),
      isPidAlive: () => true,
      managed: { has: () => true, modelOf: () => "sonnet" },
    });
    const live = provider.listCandidates().find((c) => c.id === id)!;
    const s = provider.summarize(live);
    // Without the picked model, normalizeModelId(undefined) would surface the Opus fallback — the flicker.
    expect(s.model).toBe("sonnet");
    expect(s.modelRaw).toBeUndefined();
  });

  it("leaves an Observed model-less session on the normalize fallback (no picked model to vouch)", () => {
    const id = "ffff5555-5555-5555-5555-555555555555";
    const provider = createClaudeProvider({
      claudeDir: homeWithModellessSession(id),
      isPidAlive: () => true,
      managed: { has: () => false },
    });
    const live = provider.listCandidates().find((c) => c.id === id)!;
    expect(provider.summarize(live).model).toBe("opus");
  });
});

describe("ClaudeProvider.resolveResumeTarget", () => {
  const makeHome = tempHomes("cbw-prov-resume-");

  it("delegates to the resume-target resolver: a live registry entry resolves alive + cwd", () => {
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
    expect(provider.resolveResumeTarget("sx")).toEqual({
      alive: true,
      cwd: "/w/sx",
    });
    expect(provider.resolveResumeTarget("nope")).toBeNull();
  });
});
