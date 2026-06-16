import { describe, it, expect } from "vitest";
import {
  buildClaudeCommand,
  buildResumeCommand,
} from "../../src/main/terminal/command";
import { newSessionId } from "../../src/shared/terminal";

describe("buildClaudeCommand", () => {
  it("uses the resolved absolute bin when given", () => {
    const c = buildClaudeCommand({
      id: "abc",
      model: "opus",
      bin: "/real/claude",
    });
    expect(c.file).toBe("/real/claude");
    expect(c.args).toEqual(["--session-id", "abc", "--model", "opus"]);
  });
  it("falls back to the bare name when no bin is given", () => {
    delete process.env.CBW_CLAUDE_BIN;
    expect(buildClaudeCommand({ id: "abc", model: "opus" }).file).toBe(
      "claude",
    );
  });
  it("pins the session id and maps the model to a stable CLI alias", () => {
    expect(buildClaudeCommand({ id: "sid-1", model: "opus" })).toEqual({
      file: "claude",
      args: ["--session-id", "sid-1", "--model", "opus"],
    });
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

  it("honors an explicit bin override (the executable, not the args)", () => {
    const cmd = buildClaudeCommand({
      id: "x",
      model: "opus",
      bin: "/opt/bin/claude",
    });
    expect(cmd.file).toBe("/opt/bin/claude");
    expect(cmd.args[0]).toBe("--session-id");
  });
});

describe("buildResumeCommand", () => {
  it("uses the resolved bin and resume argv", () => {
    const c = buildResumeCommand({ id: "abc", bin: "/real/claude" });
    expect(c.file).toBe("/real/claude");
    expect(c.args).toEqual(["--resume", "abc"]);
  });
  it("resumes the session under its own id, with no --model (resume restores the model)", () => {
    expect(buildResumeCommand({ id: "sid-9" })).toEqual({
      file: "claude",
      args: ["--resume", "sid-9"],
    });
  });

  it("honors an explicit bin override (the executable, not the args)", () => {
    const cmd = buildResumeCommand({ id: "x", bin: "/opt/bin/claude" });
    expect(cmd.file).toBe("/opt/bin/claude");
    expect(cmd.args).toEqual(["--resume", "x"]);
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
