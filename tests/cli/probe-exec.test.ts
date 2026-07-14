import { describe, it, expect, vi, afterEach } from "vitest";
import { createProbeExec, type ProbeSpawn } from "../../src/main/cli-check";

/** A fake spawn returning a hand-driven child: tests emit its lifecycle events to steer the exec. */
function fakeSpawn() {
  const calls: {
    file: string;
    args: string[];
    opts: { detached: boolean; stdio: unknown };
  }[] = [];
  // never[] params: every concrete listener type is assignable to (...a: never[]) => void, so the
  // fake satisfies ProbeChild's overloaded `on` without casts at the seam.
  const handlers = new Map<string, (...a: never[]) => void>();
  let dataHandler: ((d: string) => void) | undefined;
  const child = {
    killed: [] as (string | undefined)[],
    stdout: {
      setEncoding: () => {},
      on: (_ev: "data", cb: (d: string) => void) => {
        dataHandler = cb;
      },
    },
    on: (ev: string, cb: (...a: never[]) => void) => {
      handlers.set(ev, cb);
    },
    kill: (signal?: string) => {
      child.killed.push(signal);
      return true;
    },
  };
  const spawn: ProbeSpawn = (file, args, opts) => {
    calls.push({ file, args, opts });
    return child;
  };
  return {
    calls,
    child,
    spawn,
    emitData: (d: string) => dataHandler?.(d),
    emit: (ev: string, ...a: unknown[]) =>
      handlers.get(ev)?.(...(a as never[])),
  };
}

const OPTS = { encoding: "utf8" as const, timeout: 10_000 };

afterEach(() => {
  vi.useRealTimers();
});

describe("createProbeExec spawn discipline", () => {
  it("spawns detached on posix, so the interactive login shell can't seize the launching terminal's foreground group (the Ctrl+C-eating bug)", () => {
    const f = fakeSpawn();
    void createProbeExec(f.spawn, "darwin")("/bin/zsh", ["-ilc", "x"], OPTS);
    expect(f.calls[0].opts.detached).toBe(true);
    f.emit("close", 0);
  });

  it("does NOT detach on win32 — there's no foreground-group concept to defend against, and a detached child gets its own console window", () => {
    const f = fakeSpawn();
    void createProbeExec(f.spawn, "win32")("cmd.exe", ["/c", "claude"], OPTS);
    expect(f.calls[0].opts.detached).toBe(false);
    f.emit("close", 0);
  });

  it("ignores stdin and discards stderr — the probes only ever read stdout", () => {
    const f = fakeSpawn();
    void createProbeExec(f.spawn, "darwin")("/bin/zsh", ["-ilc", "x"], OPTS);
    expect(f.calls[0].opts.stdio).toEqual(["ignore", "pipe", "ignore"]);
    f.emit("close", 0);
  });
});

describe("createProbeExec settlement", () => {
  it("resolves the collected stdout on a clean exit", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emitData("2.1.208 ");
    f.emitData("(Claude Code)\n");
    f.emit("close", 0);
    await expect(p).resolves.toEqual({ stdout: "2.1.208 (Claude Code)\n" });
  });

  it("rejects with the exit code on a nonzero exit, matching execFile's error shape (classify reads .code)", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emit("close", 127);
    await expect(p).rejects.toMatchObject({ code: 127 });
  });

  it("rejects with the spawn error itself when the executable can't start (ENOENT)", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emit("error", Object.assign(new Error("nope"), { code: "ENOENT" }));
    await expect(p).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("kills the child once the timeout elapses and rejects without a not-found code (classifies as failed, like execFile's timeout)", async () => {
    vi.useFakeTimers();
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    vi.advanceTimersByTime(10_000);
    expect(f.child.killed.length).toBe(1);
    // The kill lands as a signal exit: close fires with a null code.
    f.emit("close", null);
    await expect(p).rejects.toMatchObject({ code: null });
  });

  it("settles once: a close after an error doesn't double-settle", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emit("error", Object.assign(new Error("nope"), { code: "ENOENT" }));
    f.emit("close", 1);
    await expect(p).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("settles once: a late error after a close doesn't double-settle", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emit("close", 127);
    f.emit("error", Object.assign(new Error("late"), { code: "ENOENT" }));
    await expect(p).rejects.toMatchObject({ code: 127 });
  });

  it("cancels the timeout once settled — no kill fires after a clean close", async () => {
    vi.useFakeTimers();
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emit("close", 0);
    vi.advanceTimersByTime(60_000);
    expect(f.child.killed.length).toBe(0);
    await expect(p).resolves.toEqual({ stdout: "" });
  });

  it("kills the child when stdout exceeds the 1 MiB cap, mirroring execFile's maxBuffer guard", async () => {
    const f = fakeSpawn();
    const p = createProbeExec(f.spawn, "darwin")(
      "/bin/zsh",
      ["-ilc", "x"],
      OPTS,
    );
    f.emitData("y".repeat(1_048_576 + 1));
    expect(f.child.killed.length).toBe(1);
    // The kill lands as a signal exit, so the reject carries no not-found code — classified "failed",
    // the same verdict execFile's ERR_CHILD_PROCESS_STDIO_MAXBUFFER produced.
    f.emit("close", null);
    await expect(p).rejects.toMatchObject({ code: null });
  });
});
