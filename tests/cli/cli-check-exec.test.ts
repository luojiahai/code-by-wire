import { describe, it, expect } from "vitest";
import {
  runVersion,
  runAuth,
  checkCliStatusWith,
} from "../../src/main/cli-check";
import { AGENT_PROBES } from "../../src/main/cli-status";

/** A recording stand-in for the probe exec (createProbeExec's spawn wrapper). The reject branch mirrors
 *  a real probe failure, which rejects with an Error carrying a `.code`. */
function recorder(result: { stdout: string } | { throw: Error }) {
  const calls: { file: string; args: string[]; opts: unknown }[] = [];
  const exec = (
    file: string,
    args: string[],
    opts: unknown,
  ): Promise<{ stdout: string }> => {
    calls.push({ file, args, opts });
    return "throw" in result
      ? Promise.reject(result.throw)
      : Promise.resolve({ stdout: result.stdout });
  };
  return { calls, exec };
}

/** A shell resolver that always finds /bin/zsh — deterministic, no real fs access. */
const fakeZsh = {
  isExecutable: (p: string) => p === "/bin/zsh",
  findOnPath: () => null,
};

describe("runVersion probe invocation", () => {
  it("routes through cmd.exe's PATHEXT resolution on win32 (no absolute path to resolve — the shell finds it)", async () => {
    const { calls, exec } = recorder({ stdout: "1.2.3 (Claude Code)" });
    const r = await runVersion(AGENT_PROBES.claude, exec, "win32");
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual(["/c", "claude", "--version"]);
    expect((calls[0].opts as { shell?: unknown }).shell).toBeUndefined();
    expect(r).toEqual({ status: "ok", raw: "1.2.3 (Claude Code)" });
  });

  it("wraps the check in the resolved login shell on posix", async () => {
    const { calls, exec } = recorder({ stdout: "2.1.178 (Claude Code)" });
    const r = await runVersion(AGENT_PROBES.claude, exec, "darwin", fakeZsh);
    expect(calls[0].file).toBe("/bin/zsh");
    expect(calls[0].args).toEqual(["-ilc", "'claude' '--version'"]);
    expect(r).toEqual({ status: "ok", raw: "2.1.178 (Claude Code)" });
  });

  it("classifies a spawn ENOENT as spawnError", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("nope"), { code: "ENOENT" }),
    });
    expect(await runVersion(AGENT_PROBES.claude, exec, "win32")).toEqual({
      status: "spawnError",
    });
  });

  it("classifies a posix 'command not found' exit (127) as spawnError, same as ENOENT — the outer spawn succeeds (it ran the shell fine), so ENOENT never fires; the shell itself reports the miss via exit 127", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("not found"), { code: 127 }),
    });
    expect(
      await runVersion(AGENT_PROBES.claude, exec, "darwin", fakeZsh),
    ).toEqual({
      status: "spawnError",
    });
  });

  it("classifies any other non-zero exit as failed (present but broken), not spawnError", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("boom"), { code: 1 }),
    });
    expect(
      await runVersion(AGENT_PROBES.claude, exec, "darwin", fakeZsh),
    ).toEqual({
      status: "failed",
    });
  });
});

describe("runAuth probe invocation", () => {
  it("routes through cmd.exe's PATHEXT resolution on win32", async () => {
    const { calls, exec } = recorder({
      throw: Object.assign(new Error("exit 1"), { code: 1 }),
    });
    const r = await runAuth(AGENT_PROBES.claude, exec, "win32");
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual(["/c", "claude", "auth", "status"]);
    expect(r).toEqual({ status: "loggedOut" });
  });

  it("wraps the check in the resolved login shell on posix and returns ok on a clean exit", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    const r = await runAuth(AGENT_PROBES.claude, exec, "darwin", fakeZsh);
    expect(calls[0].file).toBe("/bin/zsh");
    expect(calls[0].args).toEqual(["-ilc", "'claude' 'auth' 'status'"]);
    expect(r).toEqual({ status: "ok" });
  });
});

// checkCliStatusWith defaults to win32 (unlike checkCliStatus's real-process.platform default) so the
// injected exec sees the bare binary/args, not a posix login shell's quoted form — the same
// no-shell-quoting determinism runVersion's own win32 cases above lean on.
describe("checkCliStatusWith orchestration", () => {
  it("probes the codex binary for the codex agent and skips the auth stage", async () => {
    const { calls, exec } = recorder({ stdout: "codex-cli 0.29.0" });
    const s = await checkCliStatusWith(exec, {
      agent: "codex",
      activeConfigDir: "/c",
      now: 5,
    });
    expect(s.kind).toBe("ready");
    expect(calls).toHaveLength(1); // version only — no auth probe
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual(["/c", "codex", "--version"]);
  });

  it("probes claude with both version and auth stages, keeping the floor/tag gates", async () => {
    const { calls, exec } = recorder({ stdout: "2.1.178 (Claude Code)" });
    const s = await checkCliStatusWith(exec, {
      agent: "claude",
      activeConfigDir: "/c",
      now: 5,
    });
    expect(s.kind).toBe("ready");
    expect(calls).toHaveLength(2); // version + auth
    expect(calls[0].args).toEqual(["/c", "claude", "--version"]);
    expect(calls[1].args).toEqual(["/c", "claude", "auth", "status"]);
  });

  it("flags a codex version below no floor as still ready (codex has no minimum-version gate)", async () => {
    const { exec } = recorder({ stdout: "codex-cli 0.0.1" });
    const s = await checkCliStatusWith(exec, {
      agent: "codex",
      activeConfigDir: "/c",
      now: 5,
    });
    expect(s.kind).toBe("ready");
    expect(s.floor).toBeNull();
  });
});
