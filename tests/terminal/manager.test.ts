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

/** A fake recorder that records what it's fed and returns a canned snapshot, so the manager's wiring is
 *  testable without loading @xterm/headless. */
function recorderFactory() {
  const made: Array<{
    writes: string[];
    resizes: Array<[number, number]>;
    disposed: boolean;
    wroteAfterDispose: boolean;
  }> = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const create = (_o: { cols: number; rows: number }) => {
    const rec = {
      writes: [] as string[],
      resizes: [] as Array<[number, number]>,
      disposed: false,
      wroteAfterDispose: false, // flags a write that lands after dispose (the hazard #11 guards against)
    };
    made.push(rec);
    return {
      write: (d: string) => {
        if (rec.disposed) rec.wroteAfterDispose = true;
        rec.writes.push(d);
      },
      resize: (c: number, r: number) => rec.resizes.push([c, r]),
      snapshot: () => {
        const data = `SNAP:${rec.writes.join("")}`;
        return Promise.resolve({ data, offset: rec.writes.join("").length });
      },
      dispose: () => {
        rec.disposed = true;
      },
    };
  };
  return { create, made };
}

function harness(
  over: {
    statDir?: (cwd: string) => boolean;
    createBufferer?: (flush: (d: string) => void) => {
      add: (d: string) => void;
      flush: () => void;
      dispose: () => void;
    };
  } = {},
) {
  const ptys: ReturnType<typeof fakePty>[] = [];
  const recorders = recorderFactory();
  const sent: Array<[string, string]> = [];
  const sentOffsets: Array<[string, number]> = [];
  const exited: Array<[string, number]> = [];
  const spawned: string[] = [];
  const spawnedPids: number[] = [];
  const spawnedModels: Array<string | undefined> = [];
  const closed: string[] = [];
  let nextPid = 1000;
  const manager = createTerminalManager({
    send: (id, data, offset) => {
      sent.push([id, data]);
      sentOffsets.push([id, offset]);
    },
    notifyExit: (id, code) => exited.push([id, code]),
    onSpawned: (id, pid, model) => {
      spawned.push(id);
      spawnedPids.push(pid);
      spawnedModels.push(model);
    },
    onClosed: (id) => closed.push(id),
    createPty: (o) => {
      const f = fakePty(nextPid++);
      f.state.spawnedWith = o;
      ptys.push(f);
      return f.proc;
    },
    createBufferer: over.createBufferer ?? passthroughBufferer,
    createRecorder: recorders.create,
    env: () => ({ PATH: "/usr/bin" }),
    statDir: over.statDir ?? (() => true),
    // Pin POSIX so the bare-`claude` command and `/work/app` fixtures aren't reshaped by the Windows
    // launch shim when the test runs on a Windows host; the win32 launch form is covered in spawn-bin.
    platform: "linux",
  });
  return {
    manager,
    ptys,
    recorders,
    sent,
    sentOffsets,
    exited,
    spawned,
    spawnedPids,
    spawnedModels,
    closed,
  };
}

const REQ = {
  id: "sess-1",
  cwd: "/work/app",
  model: "sonnet" as const,
  cols: 80,
  rows: 30,
};
const ADOPT_REQ = { id: "sess-1", cwd: "/work/app", cols: 80, rows: 30 };
const FORK_REQ = {
  id: "fork-1",
  sourceId: "sess-1",
  model: "sonnet" as const,
  cwd: "/work/app",
  cols: 80,
  rows: 30,
};

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

  it("stamps each sent chunk with its cumulative output end offset, so a reattach can dedupe against it", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("abc"); // 3 chars → offset 3
    h.ptys[0].emitData("de"); // +2 → offset 5
    expect(h.sentOffsets).toEqual([
      ["sess-1", 3],
      ["sess-1", 5],
    ]);
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

  it("fork: resumes the source under a NEW id with --fork-session (no --model in argv), and registers it Managed under the new id with the source model as its picked alias", () => {
    const h = harness();
    h.manager.fork(FORK_REQ);
    expect(h.spawned).toEqual(["fork-1"]); // the new id, not the source id
    expect(h.ptys).toHaveLength(1);
    expect(h.ptys[0].state.spawnedWith!.args).toEqual([
      "--resume",
      "sess-1",
      "--session-id",
      "fork-1",
      "--fork-session",
    ]);
    expect(h.ptys[0].state.spawnedWith).toMatchObject({
      cwd: "/work/app",
      cols: 80,
      rows: 30,
    });
    // The argv carries no --model (the fork restores the source's model itself), but the source model is
    // still recorded as the registry's picked alias, exactly like spawn — so the provider fronts the
    // right model before the fork's first turn lands, instead of the default fallback.
    expect(h.spawnedModels).toEqual(["sonnet"]);
  });

  it("fork is idempotent: a second fork under the same new id does nothing", () => {
    const h = harness();
    h.manager.fork(FORK_REQ);
    h.manager.fork(FORK_REQ);
    expect(h.ptys).toHaveLength(1);
    expect(h.spawned).toEqual(["fork-1"]);
  });

  it("rejects a spawn whose cwd is not a directory: no pty, a readable message, and an exit", () => {
    const h = harness({ statDir: () => false });
    h.manager.spawn(REQ);
    expect(h.ptys).toHaveLength(0); // no pty spawned
    expect(h.spawned).toEqual([]); // never registered Managed (onSpawned never fired)
    expect(h.exited).toEqual([["sess-1", 1]]); // exit surfaced under the session id
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual([
      "sess-1",
      expect.stringContaining("/work/app"), // the message names the bad dir
    ]);
  });

  it("feeds pty output into the recorder alongside the renderer send", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("hello");
    expect(h.recorders.made[0].writes).toEqual(["hello"]);
  });

  it("feeds the recorder the coalesced batch, not each raw chunk, and drains it before snapshotting", async () => {
    // A bufferer that holds output until flush() is called, so we can tell whether the recorder is fed
    // per raw pty chunk (the old behavior — one full xterm write per chunk during a flood) or the
    // coalesced batch, and whether snapshot drains the batch first.
    const manualBufferer = (flush: (d: string) => void) => {
      let buf = "";
      return {
        add: (d: string) => {
          buf += d;
        },
        flush: () => {
          if (buf) {
            flush(buf);
            buf = "";
          }
        },
        dispose: () => {},
      };
    };
    const h = harness({ createBufferer: manualBufferer });
    h.manager.spawn(REQ);
    h.ptys[0].emitData("ab");
    h.ptys[0].emitData("cd");
    expect(h.recorders.made[0].writes).toEqual([]); // held in the bufferer — not written per raw chunk

    const snap = await h.manager.snapshot("sess-1");
    expect(h.recorders.made[0].writes).toEqual(["abcd"]); // one coalesced write, drained before serialize
    expect(snap).toEqual({ data: "SNAP:abcd", offset: 4 });
  });

  it("resizes the recorder so its serialized frame matches the pty grid", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.resize("sess-1", 120, 40);
    expect(h.recorders.made[0].resizes).toEqual([[120, 40]]);
  });

  it("disposes the recorder on natural exit", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitExit(0);
    expect(h.recorders.made[0].disposed).toBe(true);
  });

  it("disposes the recorder on disposeAll", () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.manager.disposeAll();
    expect(h.recorders.made[0].disposed).toBe(true);
  });

  it("disposeAll kills the pty before disposing its sinks, so a final flush never hits a disposed recorder", () => {
    const h = harness();
    h.manager.spawn(REQ);
    // A pty can emit one last chunk synchronously as it's killed; route it through the manager's onData.
    const pty = h.ptys[0];
    pty.proc.kill = () => {
      pty.state.killed = true;
      pty.emitData("tail");
    };

    h.manager.disposeAll();

    expect(pty.state.killed).toBe(true);
    expect(h.recorders.made[0].disposed).toBe(true);
    expect(h.recorders.made[0].wroteAfterDispose).toBe(false); // killed before the recorder was disposed
    expect(h.recorders.made[0].writes).toContain("tail"); // and the final chunk still reached it
  });

  it("snapshot returns the recorder's serialization and offset for a live id", async () => {
    const h = harness();
    h.manager.spawn(REQ);
    h.ptys[0].emitData("abc");
    await expect(h.manager.snapshot("sess-1")).resolves.toEqual({
      data: "SNAP:abc",
      offset: 3,
    });
  });

  it("snapshot returns null for an unknown id", async () => {
    const h = harness();
    await expect(h.manager.snapshot("nope")).resolves.toBeNull();
  });
});
