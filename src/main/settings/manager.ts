import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The Claude Code statusLine block. `additionalProperties: false` upstream means we must not stash
 *  our own fields inside it — bookkeeping lives in our own state file instead. The index signature
 *  keeps padding / refreshInterval / etc. intact on a round-trip. */
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
}

export interface SettingsManagerDeps {
  /** Claude config dir; defaults to ~/.claude. The seam tests inject a temp dir through. */
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
  const claudeDir = deps.claudeDir ?? join(homedir(), '.claude')
  const now = deps.now ?? (() => Date.now())

  const settingsPath = join(claudeDir, 'settings.json')
  const appDir = join(claudeDir, '.code-by-wire')
  const statePath = join(appDir, 'state.json')
  // The wrapper script the installed statusLine points at. Issue #11 materializes it; this slice only
  // records what it must call through to. Quoted so a space in the path survives `sh -c`.
  const wrapperPath = join(appDir, 'statusline-wrapper.sh')
  const appCommand = `"${wrapperPath}"`

  function readSettingsRaw(): string | null {
    try {
      return readFileSync(settingsPath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  function readState(): InstallState | null {
    try {
      return JSON.parse(readFileSync(statePath, 'utf8')) as InstallState
    } catch {
      return null
    }
  }

  function isInstalled(): boolean {
    const raw = readSettingsRaw()
    if (raw === null) return false
    try {
      const settings = JSON.parse(raw) as ClaudeSettings
      return settings.statusLine?.command === appCommand
    } catch {
      return false // a file we can't parse isn't a confirmed install
    }
  }

  function install(): InstallResult {
    const originalText = readSettingsRaw()
    const originalAbsent = originalText === null
    // Parse before touching disk: a malformed settings.json aborts the install untouched, never clobbered.
    const settings: ClaudeSettings = originalText === null ? {} : (JSON.parse(originalText) as ClaudeSettings)

    const original = settings.statusLine
    const wrappedExisting = original !== undefined
    const wrappedCommand = original?.command ?? null

    const iso = new Date(now()).toISOString()
    mkdirSync(appDir, { recursive: true })

    let backupPath: string | null = null
    if (originalText !== null) {
      backupPath = join(claudeDir, `settings.json.${iso.replace(/[:.]/g, '-')}.bak`)
      writeFileSync(backupPath, originalText, { flag: 'wx' }) // never overwrite an existing backup
    }

    const state: InstallState = { installedAt: iso, backupPath, originalAbsent, wrappedCommand }
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

    settings.statusLine = { type: 'command', command: appCommand }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')

    return { wrappedExisting, backupPath }
  }

  function uninstall(): void {
    // implemented in Task 4
  }

  return { isInstalled, install, uninstall }
}
