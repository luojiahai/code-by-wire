import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CliStatus } from "@shared/cli-status";
import {
  evaluateCliStatus,
  MIN_CLAUDE_VERSION,
  type CliProbeInput,
} from "./cli-status";
import { toSpawnForm, type ClaudeCommand } from "./terminal/command";
import { isExecutableFile, findOnPath } from "./terminal/shell-command";

const execFileAsync = promisify(execFile);

/** The execFile seam the probes call through; injected in tests to record the invocation without spawning. */
export type ProbeExec = (
  file: string,
  args: string[],
  opts: { encoding: "utf8"; timeout: number },
) => Promise<{ stdout: string }>;

const realExec: ProbeExec = (file, args, opts) =>
  execFileAsync(file, args, opts);

const realPosixShell = { isExecutable: isExecutableFile, findOnPath };

/** Resolve a logical claude probe command to what actually gets exec'd, mirroring the spawn layer's
 *  toSpawnForm: the Windows PATHEXT shim on win32, a login-shell wrap everywhere else — the SAME
 *  mechanism Managed sessions spawn through, so a "ready" verdict here means a Managed session will
 *  really work. */
function probeSpawnForm(
  cmd: ClaudeCommand,
  platform: NodeJS.Platform,
  posixShell: {
    isExecutable: (p: string) => boolean;
    findOnPath: (name: string, env: NodeJS.ProcessEnv) => string | null;
  },
): ClaudeCommand {
  return toSpawnForm(
    cmd,
    platform,
    platform === "win32"
      ? undefined
      : {
          env: process.env,
          isExecutable: posixShell.isExecutable,
          findOnPath: (name) => posixShell.findOnPath(name, process.env),
        },
  );
}

/** Map a failed `claude --version` to a probe status from the child-process error `code`. ENOENT means
 *  the outer exec target (the shim/shell itself) wasn't there — the only "not found" signal possible
 *  BEFORE this plan's login-shell/PATHEXT-shim change, when the probe exec'd an already-resolved
 *  absolute path directly. After that change there's no more pre-resolved path on either platform, so
 *  a genuinely-missing `claude` instead surfaces as the WRAPPING process (present, and spawns fine)
 *  reporting its own "not found": POSIX shells exit 127 ("command not found"); cmd.exe (the win32
 *  PATHEXT shim `launchForm` always routes a bare command through) exits 9009 ("is not recognized as
 *  an internal or external command"). All three mean the same thing — the binary isn't really there;
 *  anything else means it's there but unusable. Pure + exported so the classification is unit-tested
 *  without spawning. */
export function classifyVersionError(code: unknown): CliProbeInput["version"] {
  return code === "ENOENT" || code === 127 || code === 9009
    ? { status: "spawnError" }
    : { status: "failed" };
}

/** Map a failed `claude auth status` to a probe status: only a clean exit code 1 means logged out; any
 *  other failure (ENOENT, 127, 9009, timeout, odd exit) is "can't determine" — never cry wolf. Auth is
 *  only ever probed once `runVersion` already confirmed "ready" (see checkCliStatus below), so a
 *  not-found code can't actually reach here in practice — the 1-vs-everything-else split is still the
 *  right shape regardless. Pure + tested. */
export function classifyAuthError(code: unknown): CliProbeInput["auth"] {
  return code === 1 ? { status: "loggedOut" } : { status: "unknown" };
}

/** Probe `claude --version` through the same spawn form a Managed session would use. Exported with an
 *  injectable exec/platform/posixShell so the invocation is unit-tested without spawning. */
export async function runVersion(
  exec: ProbeExec = realExec,
  platform: NodeJS.Platform = process.platform,
  posixShell: {
    isExecutable: (p: string) => boolean;
    findOnPath: (name: string, env: NodeJS.ProcessEnv) => string | null;
  } = realPosixShell,
): Promise<CliProbeInput["version"]> {
  const { file, args } = probeSpawnForm(
    { file: "claude", args: ["--version"] },
    platform,
    posixShell,
  );
  try {
    const { stdout } = await exec(file, args, {
      encoding: "utf8",
      // Generous: a first exec of a Node CLI (or a login shell sourcing a heavy rc file) can be slow
      // (cold cache, AV scan, a network-mounted ~/.local), and a timeout here classifies as "failed" →
      // unknown → spawning blocked, locking out a CLI that actually works. The check is async, so a long
      // wait never stalls the main process.
      timeout: 10_000,
    });
    return { status: "ok", raw: stdout };
  } catch (err) {
    return classifyVersionError((err as { code?: unknown }).code);
  }
}

/** Probe `claude auth status`, invoking the binary the same way runVersion does. */
export async function runAuth(
  exec: ProbeExec = realExec,
  platform: NodeJS.Platform = process.platform,
  posixShell: {
    isExecutable: (p: string) => boolean;
    findOnPath: (name: string, env: NodeJS.ProcessEnv) => string | null;
  } = realPosixShell,
): Promise<CliProbeInput["auth"]> {
  const { file, args } = probeSpawnForm(
    { file: "claude", args: ["auth", "status"] },
    platform,
    posixShell,
  );
  try {
    await exec(file, args, { encoding: "utf8", timeout: 5_000 });
    return { status: "ok" }; // exit 0 → logged in
  } catch (err) {
    return classifyAuthError((err as { code?: unknown }).code);
  }
}

/** Run the real probes and classify. `activeConfigDir` is purely for display — where THIS APP reads
 *  Claude Code's own data from (see claude-config.ts's resolveClaudeDir), independent of the probe. */
export async function checkCliStatus(args: {
  activeConfigDir: string;
  now: number;
}): Promise<CliStatus> {
  const version = await runVersion();
  const base: Omit<CliProbeInput, "auth"> = {
    version,
    floor: MIN_CLAUDE_VERSION,
    configDir: { active: args.activeConfigDir },
    now: args.now,
  };
  // Probe auth only once the version check already lands on "ready" (a current Claude Code): evaluate
  // with auth unknown first, and run `claude auth status` only then. For every other verdict auth can't
  // change the outcome — so this skips the extra child spawn and never invokes an arbitrary command
  // before we know it's Claude.
  const provisional = evaluateCliStatus({
    ...base,
    auth: { status: "unknown" },
  });
  const auth =
    provisional.kind === "ready"
      ? await runAuth()
      : { status: "unknown" as const };
  return evaluateCliStatus({ ...base, auth });
}

export interface CliStatusController {
  get(): CliStatus | null;
  recheck(): Promise<CliStatus>;
}

export interface ControllerDeps {
  activeConfigDir: string;
  now?: () => number;
}

/** Caches the verdict; recheck refreshes it. The launch check is the first recheck(). */
export function createCliStatusController(
  deps: ControllerDeps,
): CliStatusController {
  const now = deps.now ?? ((): number => Date.now());
  let current: CliStatus | null = null;
  async function run(): Promise<CliStatus> {
    current = await checkCliStatus({
      activeConfigDir: deps.activeConfigDir,
      now: now(),
    });
    return current;
  }
  return {
    get: () => current,
    recheck: run,
  };
}
