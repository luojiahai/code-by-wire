import { posix } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildShellEnv,
  resolveShellCommand,
  safeShellCwd,
  shellSpecFor,
} from "../../src/main/terminal/shell-command";

/** Deps with nothing on disk and nothing on PATH; tests override per case. */
const none = {
  isExecutable: () => false,
  findOnPath: () => null,
};

describe("shellSpecFor", () => {
  it("gives zsh/bash an interactive login shell", () => {
    expect(shellSpecFor("/bin/zsh")).toEqual({
      file: "/bin/zsh",
      args: ["-il"],
      name: "zsh",
    });
    expect(shellSpecFor("/opt/homebrew/bin/bash").args).toEqual(["-il"]);
  });

  it("gives other POSIX shells plain interactive", () => {
    expect(shellSpecFor("/usr/bin/fish")).toEqual({
      file: "/usr/bin/fish",
      args: ["-i"],
      name: "fish",
    });
  });

  it("drops the PowerShell logo banner and names by basename", () => {
    expect(shellSpecFor("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toEqual({
      file: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      args: ["-NoLogo"],
      name: "pwsh.exe",
    });
  });

  it("gives cmd no args", () => {
    expect(shellSpecFor("C:\\Windows\\System32\\cmd.exe").args).toEqual([]);
  });
});

describe("resolveShellCommand", () => {
  it("prefers CBW_SHELL when it resolves", () => {
    const spec = resolveShellCommand({
      env: { CBW_SHELL: "/opt/weird/nu", SHELL: "/bin/zsh" },
      platform: "darwin",
      isExecutable: (p) => p === "/opt/weird/nu",
      findOnPath: () => null,
    });
    expect(spec).toEqual({ file: "/opt/weird/nu", args: ["-i"], name: "nu" });
  });

  it("resolves a bare CBW_SHELL name on PATH", () => {
    const spec = resolveShellCommand({
      env: { CBW_SHELL: "fish" },
      platform: "darwin",
      isExecutable: () => false,
      findOnPath: (n) => (n === "fish" ? "/usr/local/bin/fish" : null),
    });
    expect(spec.file).toBe("/usr/local/bin/fish");
  });

  it("honors $SHELL on POSIX", () => {
    const spec = resolveShellCommand({
      env: { SHELL: "/bin/bash" },
      platform: "linux",
      isExecutable: (p) => p === "/bin/bash",
      findOnPath: () => null,
    });
    expect(spec).toEqual({ file: "/bin/bash", args: ["-il"], name: "bash" });
  });

  it("ignores $SHELL on Windows (stray MSYS/Git paths node-pty can't spawn)", () => {
    const spec = resolveShellCommand({
      env: {
        SHELL: "/usr/bin/bash",
        COMSPEC: "C:\\Windows\\System32\\cmd.exe",
      },
      platform: "win32",
      ...none,
    });
    expect(spec.name).toBe("cmd.exe");
  });

  it("falls back through zsh → bash → sh on POSIX", () => {
    const spec = resolveShellCommand({
      env: {},
      platform: "darwin",
      isExecutable: (p) => p === "/bin/bash",
      findOnPath: () => null,
    });
    expect(spec.file).toBe("/bin/bash");
    const last = resolveShellCommand({ env: {}, platform: "darwin", ...none });
    expect(last).toEqual({ file: "/bin/sh", args: ["-i"], name: "sh" });
  });

  it("prefers pwsh, then Windows PowerShell 5.1, then COMSPEC on Windows", () => {
    const pwsh = resolveShellCommand({
      env: {},
      platform: "win32",
      isExecutable: () => false,
      findOnPath: (n) => (n === "pwsh.exe" ? "C:\\pf\\pwsh.exe" : null),
    });
    expect(pwsh).toEqual({
      file: "C:\\pf\\pwsh.exe",
      args: ["-NoLogo"],
      name: "pwsh.exe",
    });

    const builtin =
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const ps51 = resolveShellCommand({
      env: { SystemRoot: "C:\\Windows" },
      platform: "win32",
      isExecutable: (p) => p === builtin,
      findOnPath: () => null,
    });
    expect(ps51.file).toBe(builtin);
    expect(ps51.args).toEqual(["-NoLogo"]);
  });
});

describe("safeShellCwd", () => {
  const home = "/Users/me";
  // POSIX path ops so the expectations are deterministic on every CI OS (a bare node:path.resolve
  // is platform-dependent — "/repo" → "/repo" on POSIX but "C:\repo" on Windows).
  const pathDeps = {
    resolve: (p: string) => posix.resolve(p),
    dirname: (p: string) => posix.dirname(p),
  };
  it("keeps a directory", () => {
    expect(
      safeShellCwd({
        requested: "/repo",
        home,
        stat: () => "dir",
        ...pathDeps,
      }),
    ).toBe("/repo");
  });
  it("uses a file's parent directory", () => {
    expect(
      safeShellCwd({
        requested: "/repo/readme.md",
        home,
        stat: () => "file",
        ...pathDeps,
      }),
    ).toBe("/repo");
  });
  it("falls back to home for a missing path and for no request", () => {
    expect(
      safeShellCwd({ requested: "/gone", home, stat: () => null, ...pathDeps }),
    ).toBe(home);
    expect(
      safeShellCwd({
        requested: undefined,
        home,
        stat: (p) => (p === home ? "dir" : null),
        ...pathDeps,
      }),
    ).toBe(home);
  });
});

describe("buildShellEnv", () => {
  it("scrubs npm leakage and color-override vars, then declares the terminal", () => {
    const env = buildShellEnv({
      baseEnv: {
        PATH: "/usr/bin",
        npm_config_prefix: "/nvm/x",
        npm_config_registry: "r",
        npm_package_name: "cbw",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        COLORFGBG: "15;0",
      },
      appVersion: "0.1.20",
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.npm_config_prefix).toBeUndefined();
    expect(env.npm_config_registry).toBeUndefined();
    expect(env.npm_package_name).toBeUndefined();
    expect(env.NO_COLOR).toBeUndefined();
    expect(env.FORCE_COLOR).toBeUndefined();
    expect(env.COLORFGBG).toBeUndefined();
    expect(env.COLORTERM).toBe("truecolor");
    expect(env.TERM).toBe("xterm-256color");
    expect(env.TERM_PROGRAM).toBe("FlightDeck");
    expect(env.TERM_PROGRAM_VERSION).toBe("0.1.20");
    expect(env.LC_CTYPE).toBe("UTF-8");
  });

  it("keeps an existing LC_CTYPE", () => {
    const env = buildShellEnv({
      baseEnv: { LC_CTYPE: "en_US.UTF-8" },
      appVersion: "0.1.20",
    });
    expect(env.LC_CTYPE).toBe("en_US.UTF-8");
  });
});
