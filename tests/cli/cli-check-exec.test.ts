import { describe, it, expect } from "vitest";
import { runVersion, runAuth } from "../../src/main/cli-check";

/** A recording stand-in for the promisified execFile. The reject branch mirrors a real execFile failure,
 *  which rejects with an Error carrying a `.code`. */
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
    const r = await runVersion(exec, "win32");
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual(["/c", "claude", "--version"]);
    expect((calls[0].opts as { shell?: unknown }).shell).toBeUndefined();
    expect(r).toEqual({ status: "ok", raw: "1.2.3 (Claude Code)" });
  });

  it("wraps the check in the resolved login shell on posix", async () => {
    const { calls, exec } = recorder({ stdout: "2.1.178 (Claude Code)" });
    const r = await runVersion(exec, "darwin", fakeZsh);
    expect(calls[0].file).toBe("/bin/zsh");
    expect(calls[0].args).toEqual(["-ilc", "'claude' '--version'"]);
    expect(r).toEqual({ status: "ok", raw: "2.1.178 (Claude Code)" });
  });

  it("classifies a spawn ENOENT as spawnError", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("nope"), { code: "ENOENT" }),
    });
    expect(await runVersion(exec, "win32")).toEqual({ status: "spawnError" });
  });

  it("classifies a posix 'command not found' exit (127) as spawnError, same as ENOENT — the outer execFile succeeds (it ran the shell fine), so ENOENT never fires; the shell itself reports the miss via exit 127", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("not found"), { code: 127 }),
    });
    expect(await runVersion(exec, "darwin", fakeZsh)).toEqual({
      status: "spawnError",
    });
  });

  it("classifies any other non-zero exit as failed (present but broken), not spawnError", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("boom"), { code: 1 }),
    });
    expect(await runVersion(exec, "darwin", fakeZsh)).toEqual({
      status: "failed",
    });
  });
});

describe("runAuth probe invocation", () => {
  it("routes through cmd.exe's PATHEXT resolution on win32", async () => {
    const { calls, exec } = recorder({
      throw: Object.assign(new Error("exit 1"), { code: 1 }),
    });
    const r = await runAuth(exec, "win32");
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual(["/c", "claude", "auth", "status"]);
    expect(r).toEqual({ status: "loggedOut" });
  });

  it("wraps the check in the resolved login shell on posix and returns ok on a clean exit", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    const r = await runAuth(exec, "darwin", fakeZsh);
    expect(calls[0].file).toBe("/bin/zsh");
    expect(calls[0].args).toEqual(["-ilc", "'claude' 'auth' 'status'"]);
    expect(r).toEqual({ status: "ok" });
  });
});
