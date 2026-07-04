import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { toPosixPath } from "@shared/platform";
import { readTextOrNull, resolveClaudeDir } from "../claude-config";
import { recoverWrappedCommand, wrapperScript } from "./wrapper";
import { recoverWrappedCommandWin, wrapperScriptWin } from "./wrapper-win";

/** The Claude Code statusLine block. `additionalProperties: false` upstream means we must not stash our
 *  own fields inside it — bookkeeping lives in our own state file instead. While installed we own `type`
 *  and `command`; every other field of the user's block (padding, refreshInterval, …) is UPSTREAM
 *  configuration and rides along in the wrapped block — dropping refreshInterval would silently stop the
 *  statusLine re-running on idle sessions, freezing the app's live duty/clock. The index signature is how
 *  those unmodeled fields are parsed and carried without being dropped. */
interface StatusLine {
  type: string;
  command: string;
  [key: string]: unknown;
}

/** Only the slice of settings.json we touch; the index signature preserves every other key. */
interface ClaudeSettings {
  statusLine?: StatusLine;
  [key: string]: unknown;
}

/** Our record of an active install, kept out of the user's settings.json. Absent ⇒ not installed. */
interface InstallState {
  installedAt: string;
  /** The pristine backup to restore on uninstall; null when there was no settings.json to back up. */
  backupPath: string | null;
  /** settings.json did not exist before install; uninstall restores that by deleting it. */
  originalAbsent: boolean;
  /** The statusLine command we wrapped, for the wrapper script (issue #11) to call through to. */
  wrappedCommand: string | null;
  /** Whether a statusLine existed at all (decoupled from wrappedCommand, which is null for a
   *  command-less or non-string statusLine). Persisted so an idempotent re-install reports it. */
  wrappedExisting: boolean;
  /** The original block's upstream fields other than type/command (padding, refreshInterval, …), so the
   *  heal paths rebuild the block as the user tuned it. Absent on records written by older builds. */
  wrappedExtras?: Record<string, unknown>;
}

export interface SettingsManagerDeps {
  /** Claude config dir; defaults via resolveClaudeDir (CLAUDE_CONFIG_DIR, else ~/.claude). Tests inject a temp dir. */
  claudeDir?: string;
  /** Wall clock (ms) for the backup timestamp; injected so tests are deterministic. */
  now?: () => number;
  /** Host platform; defaults to process.platform. Tests inject "win32" or "darwin" to exercise both paths. */
  platform?: NodeJS.Platform;
}

export interface InstallResult {
  /** True when an existing statusLine was wrapped; false on a clean first install. */
  wrappedExisting: boolean;
  /** Absolute path of the timestamped backup, or null when there was no settings.json to back up. */
  backupPath: string | null;
  /** True when this install self-healed a desync between settings.json and our record: a wrapped
   *  settings.json whose state.json had vanished (original recovered from the wrapper script), or a
   *  surviving state.json whose statusLine entry an external edit stripped (original recovered from
   *  the record). Either way the original command was reinstalled from scratch. */
  healed: boolean;
}

/** The Settings-page readout of the wrapper install. */
export interface WrapperStatus {
  /** settings.json's statusLine currently points at our wrapper. */
  installed: boolean;
  /** The wrapped block's refreshInterval in seconds, or null when unset or not installed. */
  refreshInterval: number | null;
}

export interface SettingsManager {
  isInstalled(): boolean;
  install(): InstallResult;
  uninstall(): void;
  status(): WrapperStatus;
  setRefreshInterval(seconds: number | null): void;
}

export function createSettingsManager(
  deps: SettingsManagerDeps = {},
): SettingsManager {
  const claudeDir = resolveClaudeDir(deps.claudeDir);
  const now = deps.now ?? (() => Date.now());
  const platform = deps.platform ?? process.platform;
  const isWin = platform === "win32";

  const settingsPath = join(claudeDir, "settings.json");
  const appDir = join(claudeDir, ".code-by-wire");
  const statePath = join(appDir, "state.json");
  // The wrapper script the installed statusLine points at. Platform-aware: .ps1 on win32, .sh on POSIX.
  // Issue #11 materializes it; this slice only records what it must call through to.
  const wrapperName = isWin
    ? "statusline-wrapper.ps1"
    : "statusline-wrapper.sh";
  const wrapperPath = join(appDir, wrapperName);
  // Forward slashes in the PowerShell -File path avoid quoting issues; on POSIX, the bare quoted path is used.
  const appCommand = isWin
    ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${toPosixPath(wrapperPath)}"`
    : `"${wrapperPath}"`;

  /** Read + parse settings.json. Returns nulls when absent. Throws (before any write) on a file we can't
   *  safely round-trip: invalid JSON, or valid JSON that isn't an object (an array / null / primitive would
   *  silently drop our statusLine on re-serialize). The "parse before touch" trust-safety guard. */
  function readSettings(): {
    raw: string | null;
    parsed: ClaudeSettings | null;
  } {
    const raw = readTextOrNull(settingsPath);
    if (raw === null) return { raw: null, parsed: null };
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(
        "code-by-wire: settings.json is not valid JSON; refusing to touch it",
      );
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(
        "code-by-wire: settings.json is not a JSON object; refusing to touch it",
      );
    }
    return { raw, parsed: value as ClaudeSettings };
  }

  function isInstallState(v: unknown): v is InstallState {
    if (v === null || typeof v !== "object") return false;
    const s = v as Record<string, unknown>;
    return (
      typeof s.installedAt === "string" &&
      (typeof s.backupPath === "string" || s.backupPath === null) &&
      typeof s.originalAbsent === "boolean" &&
      (typeof s.wrappedCommand === "string" || s.wrappedCommand === null) &&
      typeof s.wrappedExisting === "boolean" &&
      // Optional so records written before this field existed still validate, never read as corrupt.
      (s.wrappedExtras === undefined ||
        (s.wrappedExtras !== null &&
          typeof s.wrappedExtras === "object" &&
          !Array.isArray(s.wrappedExtras)))
    );
  }

  /** The upstream fields of a statusLine block minus the two we own — what rides along in the wrapped
   *  block and in state.json. An absent block degrades to no extras. */
  function statusLineExtras(
    block: StatusLine | undefined,
  ): Record<string, unknown> {
    if (block === undefined) return {};
    return Object.fromEntries(
      Object.entries(block).filter(([k]) => k !== "type" && k !== "command"),
    );
  }

  /** Our install record, or null when genuinely absent. A present-but-broken record (unreadable, bad JSON,
   *  or wrong shape) throws: we DID install, so it must surface, never masquerade as "nothing to do". */
  function readState(): InstallState | null {
    const raw = readTextOrNull(statePath);
    if (raw === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("code-by-wire: state.json is corrupt or unreadable");
    }
    if (!isInstallState(value)) {
      throw new Error("code-by-wire: state.json is corrupt or invalid");
    }
    return value;
  }

  function ensureAppDir(): void {
    try {
      mkdirSync(appDir, { recursive: true });
    } catch (err) {
      throw new Error(
        `code-by-wire: cannot create ${appDir}: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  /** A backup path that does not already exist, so the kept-forever audit trail never collides — even on a
   *  same-millisecond reinstall (the injected fixed test clock makes this the common case, not the rare one). */
  function freeBackupPath(iso: string): string {
    const stamp = iso.replace(/[:.]/g, "-");
    let candidate = join(claudeDir, `settings.json.${stamp}.bak`);
    for (let i = 1; existsSync(candidate); i++) {
      candidate = join(claudeDir, `settings.json.${stamp}-${i}.bak`);
    }
    return candidate;
  }

  /** Write via a temp file + rename so a crash or partial write can never leave a truncated settings.json /
   *  state.json on disk — the file flips from old to new atomically. Preserves an explicit mode when given.
   *  A symlinked target (settings.json linked into a dotfiles repo) is written THROUGH instead, since a
   *  rename would replace the link with a regular file; this keeps the original write-through behavior. */
  function writeFileAtomic(path: string, data: string, mode?: number): void {
    let isSymlink: boolean;
    try {
      isSymlink = lstatSync(path).isSymbolicLink();
    } catch {
      isSymlink = false; // absent ⇒ not a link
    }
    if (isSymlink) {
      writeFileSync(path, data, mode !== undefined ? { mode } : {});
      if (mode !== undefined) chmodSync(path, mode);
      return;
    }
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, data, mode !== undefined ? { mode } : {});
    if (mode !== undefined) chmodSync(tmp, mode); // exact bits despite umask
    renameSync(tmp, path);
  }

  /** Materialize the executable wrapper the installed statusLine points at (issue #11). Idempotent:
   *  rewritten on every install so a deleted or stale wrapper self-heals. On POSIX, chmod 0755 so the
   *  bare `"<path>"` command in settings.json is directly executable; on Windows executability comes
   *  from the `powershell -File` invocation, so no chmod is applied. */
  function writeWrapper(wrappedCommand: string | null): void {
    const src = isWin
      ? wrapperScriptWin({ wrappedCommand })
      : wrapperScript({ wrappedCommand });
    writeFileAtomic(wrapperPath, src, isWin ? undefined : 0o755);
  }

  function isInstalled(): boolean {
    let parsed: ClaudeSettings | null;
    try {
      parsed = readSettings().parsed;
    } catch {
      return false; // a file we can't parse / isn't an object isn't a confirmed install
    }
    return parsed?.statusLine?.command === appCommand;
  }

  /** Wrap a not-yet-wrapped settings.json from scratch: back it up byte-for-byte, materialize the wrapper,
   *  record state.json, and point the statusLine at our wrapper. The single source of the wrap, reused by the
   *  self-heal path with a reconstructed (raw, parsed) so a recovered original is backed up, not the wrapped
   *  bytes. `raw === null` means there was no settings.json; uninstall restores that by deleting the file. */
  function freshInstall(
    raw: string | null,
    parsed: ClaudeSettings | null,
  ): Omit<InstallResult, "healed"> {
    const originalAbsent = raw === null;
    const original = parsed?.statusLine;
    const wrappedExisting = original !== undefined;
    // A hand-edited file could hold a non-string command; only a real string is callable.
    const wrappedCommand =
      typeof original?.command === "string" ? original.command : null;
    const wrappedExtras = statusLineExtras(original);

    const iso = new Date(now()).toISOString();
    ensureAppDir();
    writeWrapper(wrappedCommand); // the side-channel script the new statusLine will run

    let backupPath: string | null = null;
    let mode: number | undefined;
    if (raw !== null) {
      try {
        mode = statSync(settingsPath).mode & 0o777;
      } catch {
        mode = undefined; // settings.json vanished between read and stat; back up without an explicit mode
      }
      backupPath = freeBackupPath(iso);
      writeFileSync(backupPath, raw, { flag: "wx", mode }); // never overwrite an existing backup
      if (mode !== undefined) chmodSync(backupPath, mode); // keep a 0600 secret at 0600, not the default 0644
    }

    const state: InstallState = {
      installedAt: iso,
      backupPath,
      originalAbsent,
      wrappedCommand,
      wrappedExisting,
      wrappedExtras,
    };
    writeFileAtomic(statePath, JSON.stringify(state, null, 2) + "\n");

    // Extras first so our type/command always win; they can't collide (extras excludes both by
    // construction), but the wrapped block's contract shouldn't hinge on that invariant at a distance.
    const next: ClaudeSettings = {
      ...(parsed ?? {}),
      statusLine: { ...wrappedExtras, type: "command", command: appCommand },
    };
    writeFileAtomic(settingsPath, JSON.stringify(next, null, 2) + "\n", mode); // mode preserved while wrapped

    return { wrappedExisting, backupPath };
  }

  // Every wrapper we might have written into appDir, each with its recoverer. A statusLine command "is ours"
  // when it references one of these paths — the current-platform wrapper, or a leftover from another platform
  // or an older build (a .sh still referenced on Windows, say). Matched on a slash-normalized, lowercased path
  // so separator/case differences don't hide our own wrapper.
  const ownWrappers = [
    {
      path: join(appDir, "statusline-wrapper.ps1"),
      recover: recoverWrappedCommandWin,
    },
    {
      path: join(appDir, "statusline-wrapper.sh"),
      recover: recoverWrappedCommand,
    },
  ];
  function ownWrapperFor(command: string) {
    const c = toPosixPath(command).toLowerCase();
    return ownWrappers.find((w) =>
      c.includes(toPosixPath(w.path).toLowerCase()),
    );
  }

  function install(): InstallResult {
    const { raw, parsed } = readSettings(); // single read; throws on a file we can't safely touch
    const current = parsed?.statusLine?.command;

    // Wrapped with our current command and an intact record → idempotent: rewrite the wrapper (self-heals a
    // deleted/stale one) and report the recorded state.
    if (current === appCommand) {
      const state = readState(); // throws on a corrupt record
      if (state !== null) {
        writeWrapper(state.wrappedCommand);
        // The user can hand-tune upstream knobs (padding, refreshInterval) on the wrapped block while
        // installed. Keep the record in sync so a later heal rebuilds the block as tuned, not as it
        // stood when first wrapped.
        const extras = statusLineExtras(parsed?.statusLine);
        if (
          JSON.stringify(extras) !== JSON.stringify(state.wrappedExtras ?? {})
        ) {
          writeFileAtomic(
            statePath,
            JSON.stringify({ ...state, wrappedExtras: extras }, null, 2) + "\n",
          );
        }
        return {
          wrappedExisting: state.wrappedExisting,
          backupPath: state.backupPath,
          healed: false,
        };
      }
    }

    // The statusLine points at one of OUR wrappers — our current command with a vanished record, or a wrapper
    // from another platform / an older build. Re-wrapping as-is would bury the user's real command behind our
    // own wrapper path (and on Windows a .sh path hands the prompt to cmd's file association). Recover their
    // original from the wrapper the command points at and reinstall clean, so freshInstall backs up the
    // original, not the wrapped bytes.
    const own =
      typeof current === "string" ? ownWrapperFor(current) : undefined;
    if (own) {
      const wrapperSrc = readTextOrNull(own.path);
      const recovered = wrapperSrc === null ? null : own.recover(wrapperSrc);
      // The script only bakes the command; the upstream extras still live on the wrapped block itself,
      // so lift them from there into the reconstructed original.
      const statusLine =
        recovered !== null
          ? {
              ...statusLineExtras(parsed?.statusLine),
              type: "command",
              command: recovered,
            }
          : undefined;
      const healedSettings: ClaudeSettings = { ...parsed, statusLine };
      const healedRaw = JSON.stringify(healedSettings, null, 2) + "\n";
      return { ...freshInstall(healedRaw, healedSettings), healed: true };
    }

    // The mirror desync: our record survived but the statusLine entry is gone — an external edit
    // stripped it (ccstatusline's uninstall deletes whichever statusLine is present, ours included).
    // Re-wrapping the stripped file as-is would record wrappedCommand=null, silently dropping the
    // user's own prompt from the regenerated wrapper. Rebuild the settings as they stood before the
    // strip and reinstall from that, so the new wrapper's call-through and backup carry the original.
    if (parsed?.statusLine === undefined) {
      const state = readState(); // throws on a corrupt record — same contract as the wrapped branch
      if (state !== null && state.wrappedCommand !== null) {
        const healedSettings: ClaudeSettings = {
          ...(parsed ?? {}),
          statusLine: {
            ...(state.wrappedExtras ?? {}),
            type: "command",
            command: state.wrappedCommand,
          },
        };
        const healedRaw = JSON.stringify(healedSettings, null, 2) + "\n";
        return { ...freshInstall(healedRaw, healedSettings), healed: true };
      }
    }

    return { ...freshInstall(raw, parsed), healed: false };
  }

  function uninstall(): void {
    const state = readState(); // throws on a corrupt record — a record we can't read must surface
    if (state === null) {
      if (isInstalled()) {
        // Wrapped on disk with no record to restore from: silently no-op'ing would strand the user wrapped.
        throw new Error(
          "code-by-wire: settings.json is wrapped but the install record is missing; cannot restore. " +
            "Remove the statusLine from settings.json by hand.",
        );
      }
      return; // genuinely nothing we installed
    }

    if (state.originalAbsent) {
      rmSync(settingsPath, { force: true }); // restore "did not exist"
    } else {
      if (!state.backupPath || !existsSync(state.backupPath)) {
        // leave state.json intact so a retry can still restore once the backup is back
        throw new Error(
          `code-by-wire: cannot restore settings.json; backup missing (${state.backupPath})`,
        );
      }
      copyFileSync(state.backupPath, settingsPath); // byte-for-byte restore
      chmodSync(settingsPath, statSync(state.backupPath).mode & 0o777); // ...and its original permissions
    }

    // Our own artifacts go too — every wrapper we might have written (the current platform's and any
    // leftover from another platform / an older build) and the captured side-channel files. Best-effort:
    // a failure here must not block restoring the user's settings, which already succeeded above.
    for (const w of ownWrappers) rmSync(w.path, { force: true });
    rmSync(join(appDir, "statusline"), { recursive: true, force: true });
    rmSync(statePath, { force: true });
  }

  /** The Settings-page readout. Never throws: an unreadable settings.json reads as not-installed —
   *  the fault surfaces through install()/isInstalled() paths, not this display read. */
  function status(): WrapperStatus {
    let parsed: ClaudeSettings | null;
    try {
      parsed = readSettings().parsed;
    } catch {
      return { installed: false, refreshInterval: null };
    }
    const block = parsed?.statusLine;
    if (block?.command !== appCommand)
      return { installed: false, refreshInterval: null };
    const ri = block.refreshInterval;
    return {
      installed: true,
      refreshInterval:
        typeof ri === "number" && Number.isFinite(ri) ? ri : null,
    };
  }

  /** Write refreshInterval (seconds) into the wrapped block — Claude Code re-runs the statusline on
   *  this timer, which is what keeps idle sessions' captures (and the app's duty/clock) ticking. null
   *  deletes the key (events-only rendering). Only meaningful while installed; a no-op otherwise, and
   *  on out-of-range values (UI enforces 1–60, this guards 1–3600 as the hard bound). The record's
   *  wrappedExtras re-syncs in the same call so a later heal rebuilds the tuned block. */
  function setRefreshInterval(seconds: number | null): void {
    if (
      seconds !== null &&
      (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
    )
      return;
    const { parsed } = readSettings();
    const block = parsed?.statusLine;
    if (!parsed || block?.command !== appCommand) return;
    const state = readState(); // throws on a corrupt record — same contract as install(); read before any write
    const next: StatusLine = { ...block };
    if (seconds === null) delete next.refreshInterval;
    else next.refreshInterval = seconds;
    let mode: number | undefined;
    try {
      mode = statSync(settingsPath).mode & 0o777;
    } catch {
      mode = undefined;
    }
    writeFileAtomic(
      settingsPath,
      JSON.stringify({ ...parsed, statusLine: next }, null, 2) + "\n",
      mode,
    );
    if (state !== null) {
      writeFileAtomic(
        statePath,
        JSON.stringify(
          { ...state, wrappedExtras: statusLineExtras(next) },
          null,
          2,
        ) + "\n",
      );
    }
  }

  return { isInstalled, install, uninstall, status, setRefreshInterval };
}
