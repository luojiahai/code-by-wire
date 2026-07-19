import { describe, it, expect } from "vitest";
import {
  buildClaudeCommand,
  buildResumeCommand,
  buildForkCommand,
  wrapInLoginShell,
  toSpawnForm,
  buildSpawnCommand,
  launchForm,
} from "../../src/main/terminal/command";
import { newSessionId } from "../../src/shared/terminal";

describe("buildClaudeCommand", () => {
  it("always uses the bare 'claude' command — resolution is the login shell's job, not this app's", () => {
    expect(buildClaudeCommand({ id: "abc", model: "opus" })).toEqual({
      file: "claude",
      args: ["--session-id", "abc", "--model", "opus"],
    });
  });
  it("pins the session id and maps the model to a stable CLI alias", () => {
    expect(buildClaudeCommand({ id: "sid-2", model: "sonnet" }).args).toEqual([
      "--session-id",
      "sid-2",
      "--model",
      "sonnet",
    ]);
    expect(buildClaudeCommand({ id: "sid-3", model: "haiku" }).args).toContain(
      "haiku",
    );
  });
  it("omits --model entirely for the 'default' selection", () => {
    expect(buildClaudeCommand({ id: "sid-d", model: "default" }).args).toEqual([
      "--session-id",
      "sid-d",
    ]);
  });
});

describe("buildResumeCommand", () => {
  it("claude: resumes the session under its own id, with no --model (resume restores the model)", () => {
    expect(buildResumeCommand({ agent: "claude", id: "sid-9" })).toEqual({
      file: "claude",
      args: ["--resume", "sid-9"],
    });
  });
  it("codex: the `resume` subcommand with the rollout uuid, no flags", () => {
    expect(buildResumeCommand({ agent: "codex", id: "u-1" })).toEqual({
      file: "codex",
      args: ["resume", "u-1"],
    });
  });
  it("codex resume routes through the win32 PATHEXT shim like every bare command", () => {
    expect(
      launchForm(buildResumeCommand({ agent: "codex", id: "u-1" }), "win32"),
    ).toEqual({ file: "cmd.exe", args: ["/c", "codex", "resume", "u-1"] });
  });
});

describe("buildForkCommand", () => {
  it("resumes the source under a new pre-assigned id and forks, with no --model", () => {
    expect(buildForkCommand({ sourceId: "src-1", newId: "new-1" })).toEqual({
      file: "claude",
      args: ["--resume", "src-1", "--session-id", "new-1", "--fork-session"],
    });
  });
});

describe("wrapInLoginShell", () => {
  const deps = {
    env: {},
    isExecutable: (p: string) => p === "/bin/zsh",
    findOnPath: () => null,
  };

  it("wraps the claude command in the resolved shell's -ilc form, quoting every token", () => {
    const cmd = {
      file: "claude",
      args: ["--session-id", "abc", "--model", "opus"],
    };
    expect(wrapInLoginShell(cmd, deps)).toEqual({
      file: "/bin/zsh",
      args: ["-ilc", "'claude' '--session-id' 'abc' '--model' 'opus'"],
    });
  });
});

describe("toSpawnForm", () => {
  const posixShell = {
    env: {},
    isExecutable: (p: string) => p === "/bin/zsh",
    findOnPath: () => null,
  };

  it("routes through the Windows shim on win32, ignoring posixShell", () => {
    const cmd = { file: "claude", args: ["--session-id", "abc"] };
    expect(toSpawnForm(cmd, "win32", posixShell)).toEqual({
      file: "cmd.exe",
      args: ["/c", "claude", "--session-id", "abc"],
    });
  });

  it("wraps in the login shell on darwin/linux", () => {
    const cmd = { file: "claude", args: ["--session-id", "abc"] };
    expect(toSpawnForm(cmd, "darwin", posixShell)).toEqual({
      file: "/bin/zsh",
      args: ["-ilc", "'claude' '--session-id' 'abc'"],
    });
  });

  it("throws if posixShell is missing on a non-win32 platform (fail loud, never silently pass through)", () => {
    const cmd = { file: "claude", args: [] };
    expect(() => toSpawnForm(cmd, "darwin", undefined)).toThrow(/posixShell/);
  });
});

describe("newSessionId", () => {
  it("returns a v4-shaped uuid", () => {
    expect(newSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns a fresh id each call", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe("buildSpawnCommand", () => {
  it("claude → the existing pinned-id command, model flag included", () => {
    expect(
      buildSpawnCommand({ agent: "claude", id: "sid-1", model: "sonnet" }),
    ).toEqual({
      file: "claude",
      args: ["--session-id", "sid-1", "--model", "sonnet"],
    });
  });
  it("codex → the bare binary, no args: no id pin exists, models are chosen in the TUI", () => {
    expect(
      buildSpawnCommand({ agent: "codex", id: "sid-2", model: "default" }),
    ).toEqual({
      file: "codex",
      args: [],
    });
  });
  it("codex ignores a non-default model selection (documented-ignored)", () => {
    expect(
      buildSpawnCommand({ agent: "codex", id: "s", model: "opus" }).args,
    ).toEqual([]);
  });
  it("bare codex routes through the win32 PATHEXT shim like claude does", () => {
    expect(launchForm({ file: "codex", args: [] }, "win32")).toEqual({
      file: "cmd.exe",
      args: ["/c", "codex"],
    });
  });
});
