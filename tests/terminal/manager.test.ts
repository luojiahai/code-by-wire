import { describe, it, expect } from "vitest";
import { FLOW } from "../../src/shared/terminal";
import { createTerminalManager } from "../../src/main/terminal/manager";
import type {
  PtyProcess,
  SpawnOptions,
} from "../../src/main/terminal/pty-process";

/** A controllable stand-in for a node-pty process. State is closed over (no `this`), so the proc's
 *  methods mutate it directly and the test reads it back through `.state`. */
function fakePty(pid = 4321) {
  const state = {
    spawnedWith: null as SpawnOptions | null,
    writes: [] as string[],
    resizes: [] as Array<[number, number]>,
    paused: false,
    killed: false,
  };
  let dataCb: (d: string) => void = () => {};
  let exitCb: (e: { exitCode: number }) => void = () => {};
  const proc: PtyProcess = {
    pid,
    write: (d) => {
      state.writes.push(d);
    },
    resize: (c, r) => {
      state.resizes.push([c, r]);
    },
    pause: () => {
      state.paused = true;
    },
    resume: () => {
      state.paused = false;
    },
    kill: () => {
      state.killed = true;
    },
    onData: (cb) => {
      dataCb = cb;
    },
    onExit: (cb) => {
      exitCb = cb;
    },
  };
  return {
    state,
    proc,
    emitData: (d: string) => dataCb(d),
    emitExit: (code: number) => exitCb({ exitCode: code }),
  };
}

/** A bufferer that flushes synchronously, so output assertions need no timers. */
const passthroughBufferer = (flush: (d: string) => void) => ({
  add: flush,
  flush: () => {},
  dispose: () => {},
});

interface HarnessOpts {
  /** Override the injected binary resolver (returns null to simulate a missing `claude`). */
  resolveBin?: (file: string, path: string) => string | null;
  /** Override the pty factory (e.g. to throw, simulating a native spawn failure). */
  createPty?: (o: SpawnOptions) => PtyProcess;
  /** Override the clock that drives the fast-exit hint. */
  now?: () => number;
}

function harness(opts: HarnessOpts = {}) {
  const ptys: ReturnType<typeof fakePty>[] = [];
  const sent: Array<[string, string]> = [];
  const exited: Array<[string, number]> = [];
  const spawned: string[] = [];
  const spawnedPids: number[] = [];
  const closed: string[] = [];
  let nextPid = 1000;
  const manager = createTerminalManager({
    send: (id, data) => sent.push([id, data]),
    notifyExit: (id, code) => exited.push([id, code]),
    onSpawned: (id, pid) => {
      spawned.push(id);
      spawnedPids.push(pid);
    },
    onClosed: (id) => closed.push(id),
    createPty:
      opts.createPty ??
      ((o) => {
        const f = fakePty(nextPid++);
        f.state.spawnedWith = o;
        ptys.push(f);
        return f.proc;
      }),
    createBufferer: passthroughBufferer,
    env: () => ({ PATH: "/usr/bin" }),
    resolveBin: opts.resolveBin,
    now: opts.now,
  });
  return { manager, ptys, sent, exited, spawned, spawnedPids, closed };
}

const REQ = {
  id: "sess-1",
  cwd: "/work/app",
  model: "sonnet" as const,
  cols: 80,
  rows: 30,
};
const ADOPT_REQ = { id: "sess-1", cwd: "/work/app", cols: 80, rows: 30 };

describe("createTerminalManager", () => {
  it("spawns a pty, registers the id as Managed, and passes cwd/env/size through", () => {
    const h = harness();
    h.manager.spawn(REQ);
    expect(h.spawned).toEqual(["sess-1"]);
    expect(h.ptys).toHaveLength(1);
    expect(h.ptys[0].state.spawnedWith).toMatchObject({
      cwd: "/work/app",
      cols: 80,
      rows: 30,
      env: { PATH: "/usr/bin" },
    });
    expect(h.ptys[0].state.spawnedWith!.args).toEqual([
      "--session-id",
      "sess-1",
      "--model",
      "sonnet",
    ]);
  });

  it("declares truecolor capability (COLORTERM) so claude emits 24-bit color, not a muted 256-color approximation", () => {
    const h = harness();
    h.manager.spawn(REQ);
    // A Finder-launched .app inherits launchd's bare env (no COLORTERM), and the pty's TERM is only
    // xterm-256color — so claude's color detection caps below truecolor and quantizes its mascot
    // orange to the nearest 256-cube index. Declaring COLORTERM=truecolor (our WebGL terminal really
    // is 24-bit capable) restores the exact color. Layered on top of the resolved env, overriding any
    // inherited value, since the capability is ours to declare, not the launching shell's.
    expect(h.ptys[0].state.spawnedWith!.env).toMatchObject({
      PATH: "/usr/bin",
      COLORTERM: "truecolor",
    });
  });

  it("when claude can't be resolved, sends an actionable message and reports exit without spawning a pty", () => {
    const h = harness({ resolveBin: () => null });
    h.manager.spawn(REQ);
    // No pty was created and the id was never registered as Managed — the spawn was refused up front.
    expect(h.ptys).toHaveLength(0);
    expect(h.spawned).toEqual([]);
    // The renderer hears a clear message, then a 127 ("command not found") exit instead of a bare 1.
    expect(h.sent[0][0]).toBe("sess-1");
    expect(h.sent[0][1]).toContain("Could not start Claude Code");
    expect(h.exited).toEqual([["sess-1", 127]]);
  });

  it("passes the resolver the command file and the child PATH", () => {
    const seen: Array<[string, string]> = [];
    const h = harness({
      resolveBin: (file, path) => {
        seen.push([file, path]);
        return file; // resolvable
      },
    });
    h.manager.spawn(REQ);
    expect(seen).toEqual([["claude", "/usr/bin"]]);
    expect(h.ptys).toHaveLength(1); // resolution passed, so the pty was spawned
  });

  it("when node-pty throws at spawn, surfaces the failure instead of rejecting", () => {
    const h = harness({
      createPty: () => {
        throw new Error("spawn EACCES");
      },
    });
    h.manager.spawn(REQ);
    expect(h.spawned).toEqual([]);
    expect(h.sent[0][1]).toContain("spawn EACCES");
    expect(h.exited).toEqual([["sess-1", 1]]);
  });

  it("reports the pty pid alongside the id, so the registry can anchor Managed-ness to the process", () => {
    const h = harness();
    h.manager.spawn(REQ);
    expect(h.spawnedPids).toEqual([h.ptys[0].proc.pid]);
  });

  it("is idempotent: a second spawn of the same id does nothing", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.spawn(REQ);
    expect(h.ptys).toHaveLength(1);
    expect(h.spawned).toEqual(["sess-1"]);
  });

  it("batches pty output to send(), tagged with the id", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("hello");
    expect(h.sent).toEqual([["sess-1", "hello"]]);
  });

  it("routes write and resize to the right pty", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.write("sess-1", "ls\r");
    h.manager.resize("sess-1", 120, 40);
    expect(h.ptys[0].state.writes).toEqual(["ls\r"]);
    expect(h.ptys[0].state.resizes).toEqual([[120, 40]]);
  });

  it("pauses node-pty above the high-water mark and resumes once acks drain below the low-water mark", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("x".repeat(FLOW.highWaterChars + 1)); // unacked exceeds high water
    expect(h.ptys[0].state.paused).toBe(true);

    h.manager.ack("sess-1", FLOW.highWaterChars + 1 - (FLOW.lowWaterChars - 1)); // leave < lowWater unacked
    expect(h.ptys[0].state.paused).toBe(false);
  });

  it("does not resume while still above the low-water mark", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("x".repeat(FLOW.highWaterChars + 1));
    h.manager.ack("sess-1", 10); // still far above low water
    expect(h.ptys[0].state.paused).toBe(true);
  });

  it("notifies exit, then drops the terminal so later writes are no-ops", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitExit(0);
    expect(h.exited).toEqual([["sess-1", 0]]);
    h.manager.write("sess-1", "ignored");
    expect(h.ptys[0].state.writes).toEqual([]);
  });

  it("hints at an out-of-date Claude Code when a session dies right after starting", () => {
    let t = 1000;
    const h = harness({ now: () => t });
    h.manager.spawn(REQ);
    t = 1500; // 500ms after spawn — a fast, non-zero exit
    h.ptys[0].emitExit(1);
    const out = h.sent.map(([, data]) => data).join("");
    expect(out).toContain("exited right after starting");
    expect(h.exited).toEqual([["sess-1", 1]]);
  });

  it("does not hint when the session ran a while before exiting non-zero", () => {
    let t = 1000;
    const h = harness({ now: () => t });
    h.manager.spawn(REQ);
    t = 1000 + 60_000; // a minute later — not a startup failure
    h.ptys[0].emitExit(1);
    expect(h.sent.map(([, data]) => data).join("")).not.toContain(
      "exited right after starting",
    );
  });

  it("does not hint on a clean exit", () => {
    let t = 1000;
    const h = harness({ now: () => t });
    h.manager.spawn(REQ);
    t = 1200;
    h.ptys[0].emitExit(0);
    expect(h.sent.map(([, data]) => data).join("")).not.toContain(
      "exited right after starting",
    );
  });

  it("reports the id closed on natural exit, so the registry drops its Managed label", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitExit(0);
    expect(h.closed).toEqual(["sess-1"]);
  });

  it("kills every pty on disposeAll", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.spawn({ ...REQ, id: "sess-2" });
    h.manager.disposeAll();
    expect(h.ptys.map((p) => p.state.killed)).toEqual([true, true]);
    h.manager.write("sess-1", "after-dispose");
    expect(h.ptys[0].state.writes).toEqual([]);
  });

  it("reports every id closed on disposeAll, so a closed window leaves no stale Managed labels", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.spawn({ ...REQ, id: "sess-2" });
    h.manager.disposeAll();
    expect(h.closed.sort()).toEqual(["sess-1", "sess-2"]);
  });

  it("rename: re-keys a live pty to its new session id, so output, writes, and exit all follow the rotation", () => {
    const h = harness();
    h.manager.spawn(REQ); // id 'sess-1'
    h.manager.rename("sess-1", "sess-2");

    h.ptys[0].emitData("after");
    expect(h.sent).toEqual([["sess-2", "after"]]); // output now tagged with the new id

    h.manager.write("sess-2", "ok");
    h.manager.write("sess-1", "ignored"); // the old id no longer maps to this pty
    expect(h.ptys[0].state.writes).toEqual(["ok"]);

    h.ptys[0].emitExit(0);
    expect(h.exited).toEqual([["sess-2", 0]]); // exit reported under the new id
    expect(h.closed).toEqual(["sess-2"]); // and the registry drops the new id
  });

  it("rename: is a no-op for an unknown id", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.rename("nope", "sess-2");
    h.ptys[0].emitData("x");
    expect(h.sent).toEqual([["sess-1", "x"]]); // unchanged
  });

  it("adopt: resumes under the same id with no --model, and registers it Managed", () => {
    const h = harness();
    h.manager.adopt(ADOPT_REQ);
    expect(h.spawned).toEqual(["sess-1"]);
    expect(h.ptys).toHaveLength(1);
    expect(h.ptys[0].state.spawnedWith!.args).toEqual(["--resume", "sess-1"]);
    expect(h.ptys[0].state.spawnedWith).toMatchObject({
      cwd: "/work/app",
      cols: 80,
      rows: 30,
    });
  });

  it("adopt is idempotent: a second adopt of the same id does nothing", () => {
    const h = harness();
    h.manager.adopt(ADOPT_REQ);
    h.manager.adopt(ADOPT_REQ);
    expect(h.ptys).toHaveLength(1);
    expect(h.spawned).toEqual(["sess-1"]);
  });
});
