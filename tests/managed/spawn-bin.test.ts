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

describe("manager passes the resolved bin to the pty", () => {
  it("spawns the absolute path when bin is set", () => {
    const calls: SpawnOptions[] = [];
    const mgr = createTerminalManager({
      send: vi.fn(),
      notifyExit: vi.fn(),
      onSpawned: vi.fn(),
      onClosed: vi.fn(),
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
});
