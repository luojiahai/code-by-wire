import { describe, it, expect } from "vitest";
import { launchForm } from "../../src/main/terminal/command";

describe("launchForm", () => {
  it("passes an .exe through unchanged", () => {
    const c = { file: "C:\\bin\\claude.exe", args: ["--session-id", "x"] };
    expect(launchForm(c, "win32")).toEqual(c);
  });
  it("wraps a .cmd via cmd.exe /c on win32", () => {
    const c = { file: "C:\\npm\\claude.cmd", args: ["--resume", "x"] };
    expect(launchForm(c, "win32")).toEqual({
      file: "cmd.exe",
      args: ["/c", "C:\\npm\\claude.cmd", "--resume", "x"],
    });
  });
  it("wraps a .ps1 via powershell on win32", () => {
    const c = { file: "C:\\bin\\claude.ps1", args: ["--session-id", "x"] };
    expect(launchForm(c, "win32")).toEqual({
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\bin\\claude.ps1",
        "--session-id",
        "x",
      ],
    });
  });
  it("wraps a bare extensionless command via cmd.exe /c on win32", () => {
    // `claude` with no resolved absolute path: CreateProcess only appends .exe, so it would never
    // find the claude.cmd/.ps1 npm shim. cmd.exe resolves it via PATHEXT, exactly as the .cmd path does.
    const c = {
      file: "claude",
      args: ["--session-id", "x", "--model", "opus"],
    };
    expect(launchForm(c, "win32")).toEqual({
      file: "cmd.exe",
      args: ["/c", "claude", "--session-id", "x", "--model", "opus"],
    });
  });
  it("leaves an absolute path untouched on win32 (only bare names need PATHEXT)", () => {
    // launchForm is a general win32 launch-form utility, tested here in isolation: an absolute,
    // extensioned path needs no PATHEXT resolution — only a bare command name does. Extensionless
    // absolute paths are left to CreateProcess (which appends .exe), not wrapped. The spawn flow
    // itself never produces an absolute path anymore (buildClaudeCommand always returns the bare
    // "claude"), but launchForm's own contract still covers this input shape.
    const c = { file: "C:\\tools\\claude", args: ["--resume", "x"] };
    expect(launchForm(c, "win32")).toEqual(c);
  });
  it("passes through unchanged on posix", () => {
    const c = { file: "claude", args: ["--model", "opus"] };
    expect(launchForm(c, "darwin")).toEqual(c);
  });
});
