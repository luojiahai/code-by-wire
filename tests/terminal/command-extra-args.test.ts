import { describe, it, expect } from "vitest";
import {
  buildSpawnCommand,
  buildResumeCommand,
  buildForkCommand,
} from "../../src/main/terminal/command";

describe("extra args are appended after app-managed argv", () => {
  it("claude spawn: after --session-id/--model", () => {
    expect(
      buildSpawnCommand({
        agent: "claude",
        id: "abc",
        model: "sonnet",
        extraArgs: ["--dangerously-skip-permissions"],
      }),
    ).toEqual({
      file: "claude",
      args: [
        "--session-id",
        "abc",
        "--model",
        "sonnet",
        "--dangerously-skip-permissions",
      ],
    });
  });
  it("claude spawn with default model: extra args directly after the id", () => {
    expect(
      buildSpawnCommand({
        agent: "claude",
        id: "abc",
        model: "default",
        extraArgs: ["--settings", "/tmp/s.json"],
      }),
    ).toEqual({
      file: "claude",
      args: ["--session-id", "abc", "--settings", "/tmp/s.json"],
    });
  });
  it("codex spawn: extra args on the bare binary", () => {
    expect(
      buildSpawnCommand({
        agent: "codex",
        id: "abc",
        model: "default",
        extraArgs: ["--sandbox", "read-only"],
      }),
    ).toEqual({ file: "codex", args: ["--sandbox", "read-only"] });
  });
  it("omitted extraArgs leaves every argv byte-for-byte unchanged", () => {
    expect(
      buildSpawnCommand({ agent: "claude", id: "abc", model: "default" }),
    ).toEqual({ file: "claude", args: ["--session-id", "abc"] });
    expect(buildResumeCommand({ agent: "codex", id: "abc" })).toEqual({
      file: "codex",
      args: ["resume", "abc"],
    });
  });
  it("claude resume: after --resume <id>", () => {
    expect(
      buildResumeCommand({
        agent: "claude",
        id: "abc",
        extraArgs: ["--dangerously-skip-permissions"],
      }),
    ).toEqual({
      file: "claude",
      args: ["--resume", "abc", "--dangerously-skip-permissions"],
    });
  });
  it("codex resume: after the resume subcommand", () => {
    expect(
      buildResumeCommand({ agent: "codex", id: "abc", extraArgs: ["-m", "x"] }),
    ).toEqual({ file: "codex", args: ["resume", "abc", "-m", "x"] });
  });
  it("fork: after --fork-session", () => {
    expect(
      buildForkCommand({
        sourceId: "src1",
        newId: "new1",
        extraArgs: ["--dangerously-skip-permissions"],
      }),
    ).toEqual({
      file: "claude",
      args: [
        "--resume",
        "src1",
        "--session-id",
        "new1",
        "--fork-session",
        "--dangerously-skip-permissions",
      ],
    });
  });
});
