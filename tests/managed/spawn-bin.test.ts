import { describe, it, expect, vi } from "vitest";
import { createTerminalManager } from "../../src/main/terminal/manager";
import type {
  PtyProcess,
  SpawnOptions,
} from "../../src/main/terminal/pty-process";

function fakePty(): PtyProcess {
  return {
    pid: 1,
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  };
}

const baseDeps = {
  send: vi.fn(),
  notifyExit: vi.fn(),
  onSpawned: vi.fn(),
  onClosed: vi.fn(),
  statDir: () => true,
  createRecorder: () => ({
    write: vi.fn(),
    resize: vi.fn(),
    snapshot: () => Promise.resolve({ data: "", offset: 0 }),
    dispose: vi.fn(),
  }),
};

describe("manager passes the resolved bin to the pty", () => {
  it("spawns the absolute path when bin is set", () => {
    const calls: SpawnOptions[] = [];
    const mgr = createTerminalManager({
      ...baseDeps,
      createPty: (o) => {
        calls.push(o);
        return fakePty();
      },
    });
    mgr.spawn({
      id: "abc",
      cwd: "/tmp",
      model: "opus",
      cols: 80,
      rows: 24,
      bin: "/real/claude",
    });
    expect(calls[0].file).toBe("/real/claude");
  });

  it("wraps a .cmd bin into cmd.exe on win32", () => {
    const seen: { file?: string; args?: string[] } = {};
    const mgr = createTerminalManager({
      ...baseDeps,
      platform: "win32",
      createPty: (o) => {
        seen.file = o.file;
        seen.args = o.args;
        return fakePty();
      },
    });
    mgr.spawn({
      id: "s1",
      cwd: "C:\\proj",
      model: "opus",
      cols: 80,
      rows: 24,
      bin: "C:\\npm\\claude.cmd",
    });
    expect(seen.file).toBe("cmd.exe");
    expect(seen.args).toEqual([
      "/c",
      "C:\\npm\\claude.cmd",
      "--session-id",
      "s1",
      "--model",
      "opus",
    ]);
  });
});
