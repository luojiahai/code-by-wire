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

describe("runVersion probe invocation", () => {
  it("invokes a win32 .cmd shim via cmd.exe with the path as a discrete arg (never shell:true)", async () => {
    const { calls, exec } = recorder({ stdout: "1.2.3 (Claude Code)" });
    const r = await runVersion(
      "C:\\Users\\First Last\\AppData\\Roaming\\npm\\claude.cmd",
      exec,
      "win32",
    );
    expect(calls[0].file).toBe("cmd.exe");
    // The shim path is a single argv element, so execFile quotes it — a space can't split it.
    expect(calls[0].args).toEqual([
      "/c",
      "C:\\Users\\First Last\\AppData\\Roaming\\npm\\claude.cmd",
      "--version",
    ]);
    expect((calls[0].opts as { shell?: unknown }).shell).toBeUndefined();
    expect(r).toEqual({ status: "ok", raw: "1.2.3 (Claude Code)" });
  });

  it("invokes a win32 .ps1 shim via powershell -File, matching the spawn layer", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    await runVersion("C:\\bin\\claude.ps1", exec, "win32");
    expect(calls[0].file).toBe("powershell.exe");
    expect(calls[0].args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\bin\\claude.ps1",
      "--version",
    ]);
  });

  it("invokes a real win32 .exe directly with no wrapper or shell", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    await runVersion("C:\\bin\\claude.exe", exec, "win32");
    expect(calls[0].file).toBe("C:\\bin\\claude.exe");
    expect(calls[0].args).toEqual(["--version"]);
    expect((calls[0].opts as { shell?: unknown }).shell).toBeUndefined();
  });

  it("invokes the bare binary directly on posix", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    await runVersion("/usr/local/bin/claude", exec, "darwin");
    expect(calls[0].file).toBe("/usr/local/bin/claude");
    expect(calls[0].args).toEqual(["--version"]);
  });

  it("classifies a spawn ENOENT as spawnError", async () => {
    const { exec } = recorder({
      throw: Object.assign(new Error("nope"), { code: "ENOENT" }),
    });
    expect(await runVersion("C:\\bin\\claude.exe", exec, "win32")).toEqual({
      status: "spawnError",
    });
  });
});

describe("runAuth probe invocation", () => {
  it("invokes a win32 .cmd shim via cmd.exe and classifies exit 1 as loggedOut", async () => {
    const { calls, exec } = recorder({
      throw: Object.assign(new Error("exit 1"), { code: 1 }),
    });
    const r = await runAuth("C:\\a b\\claude.cmd", exec, "win32");
    expect(calls[0].file).toBe("cmd.exe");
    expect(calls[0].args).toEqual([
      "/c",
      "C:\\a b\\claude.cmd",
      "auth",
      "status",
    ]);
    expect(r).toEqual({ status: "loggedOut" });
  });

  it("returns ok on a clean exit and passes the bare binary through on posix", async () => {
    const { calls, exec } = recorder({ stdout: "" });
    const r = await runAuth("/usr/local/bin/claude", exec, "darwin");
    expect(calls[0].file).toBe("/usr/local/bin/claude");
    expect(calls[0].args).toEqual(["auth", "status"]);
    expect(r).toEqual({ status: "ok" });
  });
});
