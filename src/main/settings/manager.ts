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
} from 'node:fs'
import { join } from 'node:path'
import { readTextOrNull, resolveClaudeDir } from '../claude-config'
import { wrapperScript } from './wrapper'

/** The Claude Code statusLine block. `additionalProperties: false` upstream means we must not stash our
 *  own fields inside it — bookkeeping lives in our own state file instead. While installed we replace this
 *  block with just `{ type, command }`; the user's original (padding, refreshInterval, …) is preserved in
 *  the timestamped backup and restored verbatim on uninstall, not carried in the live config. The index
 *  signature only lets us parse a richer block without dropping the fields we don't model. */
interface StatusLine {
  type: string
  command: string
  [key: string]: unknown
}

/** Only the slice of settings.json we touch; the index signature preserves every other key. */
interface ClaudeSettings {
  statusLine?: StatusLine
  [key: string]: unknown
}

/** Our record of an active install, kept out of the user's settings.json. Absent ⇒ not installed. */
interface InstallState {
  installedAt: string
  /** The pristine backup to restore on uninstall; null when there was no settings.json to back up. */
  backupPath: string | null
  /** settings.json did not exist before install; uninstall restores that by deleting it. */
  originalAbsent: boolean
  /** The statusLine command we wrapped, for the wrapper script (issue #11) to call through to. */
  wrappedCommand: string | null
  /** Whether a statusLine existed at all (decoupled from wrappedCommand, which is null for a
   *  command-less or non-string statusLine). Persisted so an idempotent re-install reports it. */
  wrappedExisting: boolean
}

export interface SettingsManagerDeps {
  /** Claude config dir; defaults via resolveClaudeDir (CLAUDE_CONFIG_DIR, else ~/.claude). Tests inject a temp dir. */
  claudeDir?: string
  /** Wall clock (ms) for the backup timestamp; injected so tests are deterministic. */
  now?: () => number
}

export interface InstallResult {
  /** True when an existing statusLine was wrapped; false on a clean first install. */
  wrappedExisting: boolean
  /** Absolute path of the timestamped backup, or null when there was no settings.json to back up. */
  backupPath: string | null
}

export interface SettingsManager {
  isInstalled(): boolean
  install(): InstallResult
  uninstall(): void
}

export function createSettingsManager(deps: SettingsManagerDeps = {}): SettingsManager {
  const claudeDir = resolveClaudeDir(deps.claudeDir)
  const now = deps.now ?? (() => Date.now())

  const settingsPath = join(claudeDir, 'settings.json')
  const appDir = join(claudeDir, '.code-by-wire')
  const statePath = join(appDir, 'state.json')
  // The wrapper script the installed statusLine points at. Issue #11 materializes it; this slice only
  // records what it must call through to. Quoted so a space in the path survives `sh -c`.
  const wrapperPath = join(appDir, 'statusline-wrapper.sh')
  const appCommand = `"${wrapperPath}"`

  /** Read + parse settings.json. Returns nulls when absent. Throws (before any write) on a file we can't
   *  safely round-trip: invalid JSON, or valid JSON that isn't an object (an array / null / primitive would
   *  silently drop our statusLine on re-serialize). The "parse before touch" trust-safety guard. */
  function readSettings(): { raw: string | null; parsed: ClaudeSettings | null } {
    const raw = readTextOrNull(settingsPath)
    if (raw === null) return { raw: null, parsed: null }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('code-by-wire: settings.json is not valid JSON; refusing to touch it')
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('code-by-wire: settings.json is not a JSON object; refusing to touch it')
    }
    return { raw, parsed: value as ClaudeSettings }
  }

  function isInstallState(v: unknown): v is InstallState {
    if (v === null || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    return (
      typeof s.installedAt === 'string' &&
      (typeof s.backupPath === 'string' || s.backupPath === null) &&
      typeof s.originalAbsent === 'boolean' &&
      (typeof s.wrappedCommand === 'string' || s.wrappedCommand === null) &&
      typeof s.wrappedExisting === 'boolean'
    )
  }

  /** Our install record, or null when genuinely absent. A present-but-broken record (unreadable, bad JSON,
   *  or wrong shape) throws: we DID install, so it must surface, never masquerade as "nothing to do". */
  function readState(): InstallState | null {
    const raw = readTextOrNull(statePath)
    if (raw === null) return null
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('code-by-wire: state.json is corrupt or unreadable')
    }
    if (!isInstallState(value)) {
      throw new Error('code-by-wire: state.json is corrupt or invalid')
    }
    return value
  }

  function ensureAppDir(): void {
    try {
      mkdirSync(appDir, { recursive: true })
    } catch (err) {
      throw new Error(`code-by-wire: cannot create ${appDir}: ${(err as Error).message}`)
    }
  }

  /** A backup path that does not already exist, so the kept-forever audit trail never collides — even on a
   *  same-millisecond reinstall (the injected fixed test clock makes this the common case, not the rare one). */
  function freeBackupPath(iso: string): string {
    const stamp = iso.replace(/[:.]/g, '-')
    let candidate = join(claudeDir, `settings.json.${stamp}.bak`)
    for (let i = 1; existsSync(candidate); i++) {
      candidate = join(claudeDir, `settings.json.${stamp}-${i}.bak`)
    }
    return candidate
  }

  /** Write via a temp file + rename so a crash or partial write can never leave a truncated settings.json /
   *  state.json on disk — the file flips from old to new atomically. Preserves an explicit mode when given.
   *  A symlinked target (settings.json linked into a dotfiles repo) is written THROUGH instead, since a
   *  rename would replace the link with a regular file; this keeps the original write-through behavior. */
  function writeFileAtomic(path: string, data: string, mode?: number): void {
    let isSymlink = false
    try {
      isSymlink = lstatSync(path).isSymbolicLink()
    } catch {
      isSymlink = false // absent ⇒ not a link
    }
    if (isSymlink) {
      writeFileSync(path, data, mode !== undefined ? { mode } : {})
      if (mode !== undefined) chmodSync(path, mode)
      return
    }
    const tmp = `${path}.tmp`
    writeFileSync(tmp, data, mode !== undefined ? { mode } : {})
    if (mode !== undefined) chmodSync(tmp, mode) // exact bits despite umask
    renameSync(tmp, path)
  }

  /** Materialize the executable wrapper the installed statusLine points at (issue #11). Idempotent:
   *  rewritten on every install so a deleted or stale wrapper self-heals. 0755 so the bare `"<path>"`
   *  command in settings.json is directly executable. */
  function writeWrapper(wrappedCommand: string | null): void {
    writeFileAtomic(wrapperPath, wrapperScript({ wrappedCommand }), 0o755)
  }

  function isInstalled(): boolean {
    let parsed: ClaudeSettings | null
    try {
      parsed = readSettings().parsed
    } catch {
      return false // a file we can't parse / isn't an object isn't a confirmed install
    }
    return parsed?.statusLine?.command === appCommand
  }

  function install(): InstallResult {
    const { raw, parsed } = readSettings() // single read; throws on a file we can't safely touch
    const alreadyWrapped = parsed?.statusLine?.command === appCommand

    if (alreadyWrapped) {
      const state = readState() // throws on a corrupt record
      if (state === null) {
        // Wrapped on disk but no record to back it: re-wrapping would clobber and double-back-up. Surface it.
        throw new Error(
          'code-by-wire: settings.json is wrapped but the install record is missing; refusing to reinstall. ' +
            'Remove the statusLine from settings.json by hand, or restore .code-by-wire/state.json.',
        )
      }
      writeWrapper(state.wrappedCommand) // rewrite in case the wrapper file was deleted or is stale
      return { wrappedExisting: state.wrappedExisting, backupPath: state.backupPath }
    }

    const originalAbsent = raw === null
    const original = parsed?.statusLine
    const wrappedExisting = original !== undefined
    // A hand-edited file could hold a non-string command; only a real string is callable.
    const wrappedCommand = typeof original?.command === 'string' ? original.command : null

    const iso = new Date(now()).toISOString()
    ensureAppDir()
    writeWrapper(wrappedCommand) // the side-channel script the new statusLine will run

    let backupPath: string | null = null
    let mode: number | undefined
    if (raw !== null) {
      mode = statSync(settingsPath).mode & 0o777
      backupPath = freeBackupPath(iso)
      writeFileSync(backupPath, raw, { flag: 'wx', mode }) // never overwrite an existing backup
      chmodSync(backupPath, mode) // keep a 0600 secret at 0600, not the default 0644
    }

    const state: InstallState = { installedAt: iso, backupPath, originalAbsent, wrappedCommand, wrappedExisting }
    writeFileAtomic(statePath, JSON.stringify(state, null, 2) + '\n')

    const next: ClaudeSettings = { ...(parsed ?? {}), statusLine: { type: 'command', command: appCommand } }
    writeFileAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n', mode) // mode preserved while wrapped

    return { wrappedExisting, backupPath }
  }

  function uninstall(): void {
    const state = readState() // throws on a corrupt record — a record we can't read must surface
    if (state === null) {
      if (isInstalled()) {
        // Wrapped on disk with no record to restore from: silently no-op'ing would strand the user wrapped.
        throw new Error(
          'code-by-wire: settings.json is wrapped but the install record is missing; cannot restore. ' +
            'Remove the statusLine from settings.json by hand.',
        )
      }
      return // genuinely nothing we installed
    }

    if (state.originalAbsent) {
      rmSync(settingsPath, { force: true }) // restore "did not exist"
    } else {
      if (!state.backupPath || !existsSync(state.backupPath)) {
        // leave state.json intact so a retry can still restore once the backup is back
        throw new Error(`code-by-wire: cannot restore settings.json; backup missing (${state.backupPath})`)
      }
      copyFileSync(state.backupPath, settingsPath) // byte-for-byte restore
      chmodSync(settingsPath, statSync(state.backupPath).mode & 0o777) // ...and its original permissions
    }

    // Our own artifacts go too — the wrapper script and any captured side-channel files. Best-effort:
    // a failure here must not block restoring the user's settings, which already succeeded above.
    rmSync(wrapperPath, { force: true })
    rmSync(join(appDir, 'statusline'), { recursive: true, force: true })
    rmSync(statePath, { force: true })
  }

  return { isInstalled, install, uninstall }
}
