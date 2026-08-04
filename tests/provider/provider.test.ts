import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { fromTranscriptWire } from "../../src/shared/transcript";
import { tempHomes } from "../helpers/temp-home";

describe("ClaudeProvider", () => {
  it("exposes its id and the incremental sync primitives", async () => {
    const provider = createClaudeProvider({
      claudeDir: resolve("tests/fixtures/claude-home"),
      isPidAlive: (pid) => pid === 1001, // only this one is alive
      now: () => Date.parse("2026-06-09T00:00:00.000Z"),
      recentWindowMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(provider.id).toBe("claude");

    const candidates = await provider.listCandidates();
    expect(candidates).toHaveLength(5); // every fixture session surfaces (all registry-backed)
    const live = candidates.find(
      (c) => c.id === "aaaa1111-1111-1111-1111-111111111111",
    )!;
    expect(live.alive).toBe(true); // pid 1001 is the live one

    // summarize the live one → working; force it dead → ended, off the same transcript.
    expect((await provider.summarize(live)).state).toBe("working");
    expect((await provider.summarize({ ...live, alive: false })).state).toBe(
      "ended",
    );
  });
});

describe("ClaudeProvider remote reads (parse-worker seam)", () => {
  const claudeDir = resolve("tests/fixtures/claude-home");
  const liveId = "aaaa1111-1111-1111-1111-111111111111";

  it("ships summarize's parse to the remote, then adorns the result in-process", async () => {
    const shipped: string[] = [];
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      managed: { has: (id) => id === liveId },
      remote: {
        summarize: async (c) => {
          shipped.push(c.id);
          // The worker returns a pure-filesystem snapshot; management is main's call, so whatever
          // the worker said must be overridden by the registry.
          const inProcess = createClaudeProvider({ claudeDir });
          return {
            ...(await inProcess.summarize(c)),
            management: "observed" as const,
          };
        },
      },
    });
    const live = (await provider.listCandidates()).find(
      (c) => c.id === liveId,
    )!;
    const s = await provider.summarize(live);
    expect(shipped).toEqual([liveId]);
    expect(s.management).toBe("managed"); // adorned after the worker round-trip
    expect(s.state).toBe("working"); // the worker's parsed snapshot is what landed
  });

  it("falls back to the in-process parse when the remote rejects", async () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      remote: {
        summarize: () => Promise.reject(new Error("worker crashed")),
      },
    });
    const live = (await provider.listCandidates()).find(
      (c) => c.id === liveId,
    )!;
    const s = await provider.summarize(live);
    // A worker fault must not cost the row: the transcript was still parsed (title from its
    // first user turn), not degraded to the registry skeleton.
    expect(s.title).toBe("Add a login form to the settings page");
    expect(s.state).toBe("working");
  });

  it("serves listCandidates and view reads from the remote when wired", async () => {
    const calls: string[] = [];
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      now: () => 777,
      recentWindowMs: 42,
      remote: {
        listCandidates: (now, recentWindowMs) => {
          calls.push(`list:${now}:${recentWindowMs}`);
          return Promise.resolve([]);
        },
        readTranscript: (id, since) => {
          calls.push(`transcript:${id}:${since}`);
          return Promise.resolve({ status: "unchanged", mtimeMs: 5 });
        },
        readMetrics: (id) => {
          calls.push(`metrics:${id}`);
          return Promise.resolve({ status: "absent" });
        },
      },
    });
    expect(await provider.listCandidates()).toEqual([]);
    expect(await provider.readTranscript("s1", 5)).toEqual({
      status: "unchanged",
      mtimeMs: 5,
    });
    expect(await provider.readMetrics("s1")).toEqual({ status: "absent" });
    expect(calls).toEqual(["list:777:42", "transcript:s1:5", "metrics:s1"]);
  });

  it("falls back to the in-process read when a remote read rejects", async () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      remote: {
        readTranscript: () => Promise.reject(new Error("worker crashed")),
        listCandidates: () => Promise.reject(new Error("worker crashed")),
      },
    });
    // The reads still answer from disk — the fixture transcript, not an error.
    const read = fromTranscriptWire(await provider.readTranscript(liveId));
    expect(read.status).toBe("changed");
    const ids = (await provider.listCandidates()).map((c) => c.id);
    expect(ids).toContain(liveId);
  });
});

describe("ClaudeProvider.readTranscript", () => {
  const provider = createClaudeProvider({
    claudeDir: resolve("tests/fixtures/claude-home"),
  });
  const readDoc = async (id: string, since?: number) =>
    fromTranscriptWire(await provider.readTranscript(id, since));

  it("reads a session transcript into render-ready events with a change token", async () => {
    const read = await readDoc("aaaa1111-1111-1111-1111-111111111111");
    expect(read.status).toBe("changed");
    if (read.status !== "changed") return;
    expect(read.doc.events[0]).toEqual({
      kind: "user",
      text: "Add a login form to the settings page",
    });
    expect(read.doc.waitingReason).toBeNull();
    expect(read.mtimeMs).toBeGreaterThan(0);
  });

  it("surfaces the waiting reason when the tail is an unanswered question", async () => {
    const read = await readDoc("dddd4444-4444-4444-4444-444444444444");
    expect(read.status === "changed" && read.doc.waitingReason).toBe(
      "Expand-contract or big-bang?",
    );
  });

  it("reports unchanged (no re-read) when the change token still matches", async () => {
    const id = "aaaa1111-1111-1111-1111-111111111111";
    const first = await readDoc(id);
    expect(first.status).toBe("changed");
    if (first.status !== "changed") return;
    const again = await provider.readTranscript(id, first.mtimeMs);
    expect(again).toEqual({ status: "unchanged", mtimeMs: first.mtimeMs });
  });

  it("reports absent for a session with no transcript file", async () => {
    expect(await provider.readTranscript("no-such-session")).toEqual({
      status: "absent",
    });
  });

  it("resolves the same transcript path for diagnostics without exposing it through IPC", () => {
    expect(
      provider.resolveTranscriptPath("aaaa1111-1111-1111-1111-111111111111"),
    ).toMatch(/aaaa1111-1111-1111-1111-111111111111\.jsonl$/);
    expect(provider.resolveTranscriptPath("no-such-session")).toBeNull();
  });
});

describe("ClaudeProvider managed labelling", () => {
  const claudeDir = resolve("tests/fixtures/claude-home");
  const liveId = "aaaa1111-1111-1111-1111-111111111111";

  it("labels a session Managed when the registry has its id, Observed otherwise", async () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      managed: { has: (id) => id === liveId },
    });
    const candidates = await provider.listCandidates();
    const otherId = "bbbb2222-2222-2222-2222-222222222222";
    const live = candidates.find((c) => c.id === liveId)!;
    const other = candidates.find((c) => c.id === otherId)!;
    expect((await provider.summarize(live)).management).toBe("managed");
    expect((await provider.summarize(other)).management).toBe("observed");
  });

  it("defaults to Observed when no registry is injected", async () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
    });
    const live = (await provider.listCandidates()).find(
      (c) => c.id === liveId,
    )!;
    expect((await provider.summarize(live)).management).toBe("observed");
  });

  it("reverts a previously-Managed snapshot to Observed when the registry no longer has it (restate)", async () => {
    const provider = createClaudeProvider({
      claudeDir,
      isPidAlive: () => true,
      managed: { has: () => false },
    });
    const live = (await provider.listCandidates()).find(
      (c) => c.id === liveId,
    )!;
    const wasManaged = {
      ...(await provider.summarize(live)),
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

  it("fronts the registry's picked model while the transcript has recorded no real model yet", async () => {
    const id = "ffff5555-5555-5555-5555-555555555555";
    const provider = createClaudeProvider({
      claudeDir: homeWithModellessSession(id),
      isPidAlive: () => true,
      managed: { has: () => true, modelOf: () => "sonnet" },
    });
    const live = (await provider.listCandidates()).find((c) => c.id === id)!;
    const s = await provider.summarize(live);
    // Without the picked model, normalizeModelId(undefined) would surface the Opus fallback — the flicker.
    expect(s.model).toBe("sonnet");
    expect(s.modelRaw).toBeUndefined();
  });

  it("leaves an Observed model-less session on the normalize fallback (no picked model to vouch)", async () => {
    const id = "ffff5555-5555-5555-5555-555555555555";
    const provider = createClaudeProvider({
      claudeDir: homeWithModellessSession(id),
      isPidAlive: () => true,
      managed: { has: () => false },
    });
    const live = (await provider.listCandidates()).find((c) => c.id === id)!;
    expect((await provider.summarize(live)).model).toBe("opus");
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
