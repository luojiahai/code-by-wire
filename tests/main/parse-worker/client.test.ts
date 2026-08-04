import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { PersistedSession, SessionCandidate } from "@shared/types";
import type {
  ParseRequest,
  ParseResponse,
} from "../../../src/main/parse-worker/protocol";

// A controllable stand-in for Electron's UtilityProcess: tests deliver replies and exits by hand,
// so every fault path (crash, timeout, late reply, crash loop) is driven deterministically.
class FakeWorker extends EventEmitter {
  sent: ParseRequest[] = [];
  killed = false;
  postMessage(req: ParseRequest): void {
    this.sent.push(req);
  }
  kill(): void {
    this.killed = true;
  }
  reply(res: ParseResponse): void {
    this.emit("message", res);
  }
  exit(code: number): void {
    this.emit("exit", code);
  }
}

const { forked } = vi.hoisted(() => ({ forked: [] as unknown[] }));
vi.mock("electron", () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      const w = new FakeWorker();
      forked.push(w);
      return w;
    }),
  },
}));

import { createParseWorkerClient } from "../../../src/main/parse-worker/client";

const candidate: SessionCandidate = {
  id: "s1",
  alive: true,
  status: "busy",
  cwd: "/w/p",
  agent: "claude",
  transcriptMtimeMs: 5,
};

const session = (id: string): PersistedSession =>
  ({ id, title: id }) as PersistedSession;

const makeClient = () => createParseWorkerClient("/out/parse-worker.js");
const lastWorker = (): FakeWorker => forked[forked.length - 1] as FakeWorker;

afterEach(() => {
  forked.length = 0;
  vi.useRealTimers();
});

describe("createParseWorkerClient", () => {
  it("forks lazily, correlates out-of-order replies by seq, and resolves each caller", async () => {
    const client = makeClient();
    expect(forked).toHaveLength(0); // nothing spawned until the first parse

    const a = client.summarize(candidate);
    const b = client.summarize({ ...candidate, id: "s2" });
    expect(forked).toHaveLength(1); // one worker serves both
    const w = lastWorker();
    const [reqA, reqB] = w.sent;

    // Answer in reverse order; seq correlation must route each to its own caller.
    w.reply({ seq: reqB.seq, ok: true, session: session("s2") });
    w.reply({ seq: reqA.seq, ok: true, session: session("s1") });
    await expect(b).resolves.toMatchObject({ id: "s2" });
    await expect(a).resolves.toMatchObject({ id: "s1" });
  });

  it("rejects on an ok:false reply with the worker's error message", async () => {
    const client = makeClient();
    const p = client.summarize(candidate);
    const w = lastWorker();
    w.reply({ seq: w.sent[0].seq, ok: false, error: "parse boom" });
    await expect(p).rejects.toThrow("parse boom");
  });

  it("rejects in-flight requests when the worker dies, then respawns on the next parse", async () => {
    const client = makeClient();
    const p = client.summarize(candidate);
    lastWorker().exit(1);
    await expect(p).rejects.toThrow("parse worker exited");

    const p2 = client.summarize(candidate);
    expect(forked).toHaveLength(2); // a fresh fork, not the dead one
    const w2 = lastWorker();
    w2.reply({ seq: w2.sent[0].seq, ok: true, session: session("s1") });
    await expect(p2).resolves.toMatchObject({ id: "s1" });
  });

  it("stops respawning after three consecutive crashes and rejects immediately", async () => {
    const client = makeClient();
    for (let i = 0; i < 3; i++) {
      const p = client.summarize(candidate);
      lastWorker().exit(9);
      await expect(p).rejects.toThrow("parse worker exited");
    }
    expect(forked).toHaveLength(3);
    // The circuit is open: no fourth fork, the caller falls straight back to in-process parse.
    await expect(client.summarize(candidate)).rejects.toThrow("crash-looped");
    expect(forked).toHaveLength(3);
  });

  it("resets the crash counter on any successful round-trip", async () => {
    const client = makeClient();
    for (let i = 0; i < 2; i++) {
      const p = client.summarize(candidate);
      lastWorker().exit(9);
      await expect(p).rejects.toThrow("parse worker exited");
    }
    // One healthy reply — two prior crashes must stop counting toward the cutoff.
    const ok = client.summarize(candidate);
    const w = lastWorker();
    w.reply({ seq: w.sent[0].seq, ok: true, session: session("s1") });
    await ok;
    // Two more crashes: the first rides the still-alive healthy worker, the second a respawn.
    for (let i = 0; i < 2; i++) {
      const p = client.summarize(candidate);
      lastWorker().exit(9);
      await expect(p).rejects.toThrow("parse worker exited");
    }
    // Still under the cutoff (2 since the success, not 4) → a fresh fork is allowed.
    void client.summarize(candidate).catch(() => {});
    expect(forked).toHaveLength(5);
  });

  it("times out a hung request, kills the worker, and ignores the late reply", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const p = client.summarize(candidate);
    const w = lastWorker();
    vi.advanceTimersByTime(30_000);
    await expect(p).rejects.toThrow("timed out");
    expect(w.killed).toBe(true);

    // The reply that eventually arrives from the killed worker must be dropped, not crash.
    w.reply({ seq: w.sent[0].seq, ok: true, session: session("s1") });

    // The next parse gets a fresh worker (the timed-out one was abandoned).
    void client.summarize(candidate).catch(() => {});
    expect(forked).toHaveLength(2);
  });

  it("dispose rejects in-flight requests, kills the worker, and refuses further parses", async () => {
    const client = makeClient();
    const p = client.summarize(candidate);
    const w = lastWorker();
    client.dispose();
    await expect(p).rejects.toThrow("disposed");
    expect(w.killed).toBe(true);
    await expect(client.summarize(candidate)).rejects.toThrow("disposed");
    // A post-dispose exit of the killed worker must not count as a crash or log noise-throw.
    w.exit(0);
  });

  it("rejects (instead of throwing) when the fork itself fails", async () => {
    const { utilityProcess } = await import("electron");
    (utilityProcess.fork as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error("ENOENT: no such bundle");
      },
    );
    const client = makeClient();
    await expect(client.summarize(candidate)).rejects.toThrow("ENOENT");
  });
});
