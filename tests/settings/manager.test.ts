import { describe, it, expect } from 'vitest'
import { writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync, chmodSync, symlinkSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { createSettingsManager } from '../../src/main/settings/manager'
import { tempHomes } from '../helpers/temp-home'

const NOW = 1781000000000 // fixed clock (ms) for deterministic backup timestamps

const makeHome = tempHomes('cbw-settings-')

const settingsPath = (home: string) => join(home, 'settings.json')
const readRaw = (home: string) => readFileSync(settingsPath(home), 'utf8')
const readJson = (home: string) => JSON.parse(readRaw(home))
const readState = (home: string) => JSON.parse(readFileSync(join(home, '.code-by-wire', 'state.json'), 'utf8'))

// The exact command install writes — the contract the wrapper script (issue #11) will live behind.
const appCommandFor = (home: string) => `"${join(home, '.code-by-wire', 'statusline-wrapper.sh')}"`

describe('install — clean (AC #2)', () => {
  it('adds the app statusLine and preserves every other key when none exists', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ theme: 'dark', permissions: { allow: ['Bash'] } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(mgr.isInstalled()).toBe(false)
    const result = mgr.install()

    const after = readJson(home)
    expect(after.statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    expect(after.theme).toBe('dark') // untouched
    expect(after.permissions).toEqual({ allow: ['Bash'] }) // untouched
    expect(result.wrappedExisting).toBe(false)
    expect(mgr.isInstalled()).toBe(true)
  })

  it('creates settings.json from scratch when the file is absent', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(existsSync(settingsPath(home))).toBe(false)
    const result = mgr.install()

    expect(readJson(home).statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    expect(result.wrappedExisting).toBe(false)
    expect(mgr.isInstalled()).toBe(true)
  })
})

describe('install — backup before modification (AC #3)', () => {
  it('writes a timestamped backup whose bytes equal the original, before modifying', () => {
    const home = makeHome()
    // Deliberately non-canonical (single-line, no trailing newline) so this can't pass against a backup
    // taken from the reserialized in-memory settings instead of the raw pre-install bytes.
    const original = '{"theme":"dark"}'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()

    expect(backupPath).not.toBeNull()
    expect(backupPath!.endsWith('.bak')).toBe(true)
    expect(backupPath!.startsWith(home)).toBe(true) // next to settings.json, easy to find by hand
    expect(readFileSync(backupPath!, 'utf8')).toBe(original) // exact pre-install bytes, formatting and all
  })

  it('writes no backup when there was no settings.json to back up', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()

    expect(backupPath).toBeNull()
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(0)
  })
})

describe('install — wrap an existing statusLine (AC #1)', () => {
  it('records the original command in state.json and reports it wrapped, not clobbered', () => {
    const home = makeHome()
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt --color', padding: 2 } }, null, 2),
    )
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const result = mgr.install()

    // The app's command is now installed...
    expect(readJson(home).statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    // ...and the user's original is preserved for the wrapper (issue #11) to call through to.
    const state = readState(home)
    expect(state.wrappedCommand).toBe('my-prompt --color')
    expect(state.originalAbsent).toBe(false)
    expect(state.backupPath).toBe(result.backupPath)
    expect(result.wrappedExisting).toBe(true)
  })

  it('records originalAbsent + null wrappedCommand when settings.json did not exist', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()

    const state = readState(home)
    expect(state.originalAbsent).toBe(true)
    expect(state.wrappedCommand).toBeNull()
    expect(state.backupPath).toBeNull()
  })
})

describe('uninstall — restore byte-for-byte (AC #4)', () => {
  it('restores arbitrary original bytes exactly (4-space indent, no trailing newline, existing statusLine)', () => {
    const home = makeHome()
    // Deliberately not our canonical format: byte-for-byte must hold regardless of formatting.
    const original =
      '{\n    "theme": "dark",\n    "statusLine": {"type":"command","command":"my-prompt","padding":2}\n}'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()
    expect(readRaw(home)).not.toBe(original) // proves install actually changed the file
    mgr.uninstall()

    expect(readRaw(home)).toBe(original) // byte-for-byte
    expect(mgr.isInstalled()).toBe(false)
    expect(existsSync(backupPath!)).toBe(true) // backups are kept as an audit/recovery trail
  })

  it('restores "no settings.json" by deleting the file install created', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()
    expect(existsSync(settingsPath(home))).toBe(true)
    mgr.uninstall()

    expect(existsSync(settingsPath(home))).toBe(false)
    expect(mgr.isInstalled()).toBe(false)
  })

  it('throws rather than silently leaving wrapped settings when the backup is gone', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()
    rmSync(backupPath!) // the backup vanishes

    expect(() => mgr.uninstall()).toThrow(/backup missing/)
    expect(mgr.isInstalled()).toBe(true) // still wrapped — we did NOT silently clear it
    expect(existsSync(join(home, '.code-by-wire', 'state.json'))).toBe(true) // record kept so a retry can restore
  })
})

describe('trust-safety', () => {
  it('install is idempotent: a second install neither re-wraps nor writes a second backup', () => {
    const home = makeHome()
    const original = JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt' }, theme: 'dark' }, null, 2) + '\n'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const first = mgr.install()
    const second = mgr.install() // must be a no-op

    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(1) // no second backup
    expect(readState(home).wrappedCommand).toBe('my-prompt') // still the user's, not our own command
    expect(second.wrappedExisting).toBe(true)
    expect(second.backupPath).toBe(first.backupPath)

    mgr.uninstall()
    expect(readRaw(home)).toBe(original) // round-trip still pristine
  })

  it('refuses to touch a malformed settings.json (parse before any write)', () => {
    const home = makeHome()
    const malformed = '{ this is not valid json'
    writeFileSync(settingsPath(home), malformed)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.install()).toThrow()
    expect(readRaw(home)).toBe(malformed) // untouched
    expect(existsSync(join(home, '.code-by-wire', 'state.json'))).toBe(false) // no state written
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(0) // no backup written
  })

  it('uninstall is a no-op when nothing was installed', () => {
    const home = makeHome()
    const original = JSON.stringify({ theme: 'dark' }, null, 2)
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.uninstall()).not.toThrow()
    expect(readRaw(home)).toBe(original) // untouched
  })

  it('captures a non-string statusLine command as null, but still marks it wrapped', () => {
    const home = makeHome()
    // A hand-edited file could hold a non-string command. StatusLine.command is *typed* string,
    // but the value comes from JSON.parse with no runtime check — guard the trust boundary.
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 123 } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const result = mgr.install()

    expect(result.wrappedExisting).toBe(true) // a statusLine did exist
    expect(readState(home).wrappedCommand).toBeNull() // ...but there was no string command to call through to
  })

  it('surfaces a corrupt state.json on uninstall instead of silently leaving the user wrapped', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()

    writeFileSync(join(home, '.code-by-wire', 'state.json'), '{ corrupt not json') // the record we rely on is broken

    expect(() => mgr.uninstall()).toThrow()
    expect(mgr.isInstalled()).toBe(true) // still wrapped — we did NOT silently pretend to uninstall
    expect(existsSync(join(home, '.code-by-wire', 'state.json'))).toBe(true) // broken record kept, not deleted
  })
})

describe('trust-safety — desync between settings.json and state.json', () => {
  it('uninstall surfaces a wrapped settings.json whose state record is missing, never silently no-ops', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()

    rmSync(join(home, '.code-by-wire', 'state.json')) // the record we rely on vanishes while still wrapped

    expect(() => mgr.uninstall()).toThrow(/install record|wrapped/i)
    expect(mgr.isInstalled()).toBe(true) // still wrapped — a missing record must not read as "not installed"
  })

  it('install refuses to reinstall over a wrapped settings.json with no state record', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    const first = mgr.install()

    rmSync(join(home, '.code-by-wire', 'state.json'))

    // Must not fabricate a clean-install result over an already-wrapped file.
    expect(() => mgr.install()).toThrow(/install record|wrapped/i)
    // ...and must not mint a second backup behind the user's back.
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(1)
    expect(first.backupPath).not.toBeNull()
  })

  it('uninstall surfaces a structurally wrong (but valid JSON) state.json', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()

    writeFileSync(join(home, '.code-by-wire', 'state.json'), '{}') // valid JSON, wrong shape

    expect(() => mgr.uninstall()).toThrow(/corrupt|invalid/i)
    expect(mgr.isInstalled()).toBe(true) // still wrapped — wrong-shape state must not strand the user
  })
})

describe('trust-safety — valid-but-non-object settings.json', () => {
  it('refuses a settings.json that is a JSON array, leaving it untouched', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), '[]')
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.install()).toThrow(/not a JSON object/i)
    expect(readRaw(home)).toBe('[]') // untouched
    expect(existsSync(join(home, '.code-by-wire', 'state.json'))).toBe(false) // no state written
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(0) // no backup written
  })

  it('refuses a settings.json that is the literal null, with a clear error not a raw TypeError', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), 'null')
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.install()).toThrow(/not a JSON object/i)
    expect(readRaw(home)).toBe('null') // untouched
  })
})

describe('trust-safety — reinstall after uninstall (backup collision)', () => {
  it('does not collide on the backup filename when the clock has not advanced', () => {
    const home = makeHome()
    const original = JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2) + '\n'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()
    mgr.uninstall() // keeps the first backup as an audit trail
    expect(() => mgr.install()).not.toThrow() // same NOW must not throw EEXIST on the kept backup

    expect(mgr.isInstalled()).toBe(true)
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(2) // both backups kept, distinct names
  })
})

describe.skipIf(process.platform === 'win32')('trust-safety — symlinked settings.json', () => {
  it('writes through a symlinked settings.json instead of replacing the link (dotfiles-style)', () => {
    const home = makeHome()
    const real = join(home, 'real-settings.json')
    writeFileSync(real, JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    symlinkSync(real, settingsPath(home)) // settings.json → real-settings.json, e.g. linked into a dotfiles repo
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()

    expect(lstatSync(settingsPath(home)).isSymbolicLink()).toBe(true) // link preserved, not clobbered to a file
    expect(JSON.parse(readFileSync(real, 'utf8')).statusLine.command).toBe(appCommandFor(home)) // written through

    mgr.uninstall()

    expect(lstatSync(settingsPath(home)).isSymbolicLink()).toBe(true) // still a link after restore
    expect(JSON.parse(readFileSync(real, 'utf8')).statusLine.command).toBe('mine') // restored through the link
  })
})

describe.skipIf(process.platform === 'win32')('trust-safety — file permissions', () => {
  it('preserves a restrictive (0600) settings.json mode through install and uninstall', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    chmodSync(settingsPath(home), 0o600)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()

    const mask = 0o777
    expect(statSync(backupPath!).mode & mask).toBe(0o600) // backup must not widen a 0600 secret to 0644
    expect(statSync(settingsPath(home)).mode & mask).toBe(0o600) // nor the live wrapped file

    mgr.uninstall()
    expect(statSync(settingsPath(home)).mode & mask).toBe(0o600) // nor the restored file
  })
})

describe('install — materializes the wrapper script (issue #11)', () => {
  const wrapperPath = (home: string) => join(home, '.code-by-wire', 'statusline-wrapper.sh')

  it('writes an executable wrapper that calls through to the wrapped command', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()

    expect(existsSync(wrapperPath(home))).toBe(true)
    const src = readFileSync(wrapperPath(home), 'utf8')
    expect(src).toContain('| my-prompt')
    if (process.platform !== 'win32') {
      expect(statSync(wrapperPath(home)).mode & 0o777).toBe(0o755) // directly executable
    }
  })

  it('writes a capture-only wrapper (no call-through) on a clean install with no original', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()

    const src = readFileSync(wrapperPath(home), 'utf8')
    expect(src).toContain('/statusline') // still writes captures into our dir
    expect(src).not.toMatch(/\| \S/) // no call-through pipe to any command
  })

  it('re-install self-heals a deleted wrapper without minting a second backup', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()
    rmSync(wrapperPath(home)) // the wrapper vanishes while still wrapped

    mgr.install() // already-wrapped path must rewrite it

    expect(existsSync(wrapperPath(home))).toBe(true)
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(1)
  })

  it('uninstall removes the wrapper and the capture dir', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()
    expect(existsSync(wrapperPath(home))).toBe(true)

    mgr.uninstall()

    expect(existsSync(wrapperPath(home))).toBe(false)
    expect(existsSync(join(home, '.code-by-wire', 'statusline'))).toBe(false)
  })

  it('writes no wrapper when it refuses a malformed settings.json', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), '{ not valid json')
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.install()).toThrow()
    expect(existsSync(wrapperPath(home))).toBe(false) // bailed before ensureAppDir/writeWrapper
  })
})
