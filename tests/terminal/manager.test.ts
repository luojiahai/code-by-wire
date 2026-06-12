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

function harness() {
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
    createPty: (o) => {
      const f = fakePty(nextPid++);
      f.state.spawnedWith = o;
      ptys.push(f);
      return f.proc;
    },
    createBufferer: passthroughBufferer,
    env: () => ({ PATH: "/usr/bin" }),
  });
  return { manager, ptys, sent, exited, spawned, spawnedPids, closed };
}

const REQ = {
  id: "sess-1",
  cwd: "/work/app",
  model: "claude-sonnet-4-6" as const,
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
