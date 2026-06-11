import { describe, it, expect, vi } from 'vitest'
import { resolveShellPath, parseProbedPath } from '../../src/main/terminal/shell-path'

const HOME = '/Users/me'
// The bare PATH launchd hands a Finder-launched .app — no ~/.local/bin, so `claude` isn't found.
const LAUNCHD_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const DELIM = '__CBW_PATH_DELIM__'

describe('resolveShellPath', () => {
  it('prepends the login-shell PATH so an installed `claude` resolves again', () => {
    const probe = vi.fn(() => `/opt/homebrew/bin:${HOME}/.local/bin:/usr/bin:/bin`)
    const out = resolveShellPath({ platform: 'darwin', shell: '/bin/zsh', home: HOME, currentPath: LAUNCHD_PATH, probe })
    const segs = out.split(':')
    expect(segs).toContain(`${HOME}/.local/bin`) // where the official installer puts claude
    expect(segs.indexOf('/opt/homebrew/bin')).toBe(0) // login-shell entries lead
    expect(probe).toHaveBeenCalledWith('/bin/zsh')
  })

  it('dedupes, keeping each dir at its first (highest-priority) position', () => {
    const probe = vi.fn(() => `${HOME}/.local/bin:/usr/bin:/bin`)
    const out = resolveShellPath({ platform: 'darwin', shell: '/bin/zsh', home: HOME, currentPath: LAUNCHD_PATH, probe })
    const segs = out.split(':')
    expect(segs.filter((s) => s === '/usr/bin')).toHaveLength(1)
    expect(segs.indexOf(`${HOME}/.local/bin`)).toBe(0)
  })

  it('falls back to well-known install dirs when the shell probe fails', () => {
    const probe = vi.fn(() => null) // shell hung, missing, or printed nothing usable
    const out = resolveShellPath({ platform: 'darwin', shell: '/bin/zsh', home: HOME, currentPath: LAUNCHD_PATH, probe })
    const segs = out.split(':')
    // The launchd PATH is preserved, and the standard claude/homebrew dirs are appended as a backstop.
    expect(segs).toEqual(expect.arrayContaining(['/usr/bin', `${HOME}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin']))
  })

  it('leaves PATH untouched off macOS (the launchd-PATH problem is mac-only)', () => {
    const probe = vi.fn(() => 'should-not-be-used')
    const out = resolveShellPath({ platform: 'linux', shell: '/bin/bash', home: HOME, currentPath: '/usr/bin:/bin', probe })
    expect(out).toBe('/usr/bin:/bin')
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('parseProbedPath', () => {
  it('extracts the fenced PATH, ignoring an rc-file banner and printenv’s trailing newline', () => {
    // What `printf %s "$DELIM"; printenv PATH; printf %s "$DELIM"` emits, with a banner from .zshrc first.
    const out = `Welcome to your shell!\n${DELIM}/opt/homebrew/bin:/usr/bin\n${DELIM}`
    expect(parseProbedPath(out)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('returns null when the fence is missing (shell errored before the probe ran)', () => {
    expect(parseProbedPath('command not found: printenv\n')).toBeNull()
    expect(parseProbedPath(`${DELIM}/usr/bin`)).toBeNull() // only the opening delimiter
  })

  it('returns null when the fenced value is empty (PATH unset)', () => {
    expect(parseProbedPath(`${DELIM}\n${DELIM}`)).toBeNull()
  })
})
