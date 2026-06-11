import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'

export interface GitInfo {
  /** Current branch, or null when detached. */
  branch: string | null
  insertions: number
  deletions: number
  /** Commits ahead/behind the upstream, or null when there is no upstream. */
  ahead: number | null
  behind: number | null
  /** Short commit hash, or null on an empty repo. */
  sha: string | null
  /** Any staged/unstaged/untracked change present. */
  dirty: boolean
}

const TTL_MS = 5000
const cache = new Map<string, { token: string; expiry: number; value: GitInfo | null }>()

/** A non-throwing git invocation: trimmed stdout, or null on any failure (not a repo, no upstream, …). */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim()
  } catch {
    return null
  }
}

/** Sum insertions/deletions from a `git diff --shortstat` line. Absent numbers are 0. */
function parseShortstat(out: string | null): { insertions: number; deletions: number } {
  if (!out) return { insertions: 0, deletions: 0 }
  const ins = /(\d+) insertion/.exec(out)
  const del = /(\d+) deletion/.exec(out)
  return { insertions: ins ? Number(ins[1]) : 0, deletions: del ? Number(del[1]) : 0 }
}

/** Cheap freshness token: the mtimes of .git/HEAD and .git/index. A commit/checkout/stage moves one. */
function gitToken(cwd: string): string | null {
  const gitDir = git(cwd, ['rev-parse', '--git-dir'])
  if (gitDir === null) return null
  const abs = gitDir.startsWith('/') ? gitDir : join(cwd, gitDir)
  const m = (p: string): number => {
    try {
      return statSync(join(abs, p)).mtimeMs
    } catch {
      return 0
    }
  }
  return `${m('HEAD')}:${m('index')}`
}

/** Read the local git glance for `cwd`. null when `cwd` isn't a work tree. Cached per cwd on the
 *  HEAD/index mtimes plus a 5s TTL, so a steady metrics poll shells git at most once per change. */
export function readGit(cwd: string): GitInfo | null {
  const now = Date.now()
  const token = gitToken(cwd)
  if (token === null) {
    cache.set(cwd, { token: '', expiry: now + TTL_MS, value: null })
    return null
  }
  const hit = cache.get(cwd)
  if (hit && hit.token === token && hit.expiry > now) return hit.value

  const inside = git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside !== 'true') {
    cache.set(cwd, { token, expiry: now + TTL_MS, value: null })
    return null
  }
  const branchRaw = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRaw && branchRaw !== 'HEAD' ? branchRaw : null
  const sha = git(cwd, ['rev-parse', '--short', 'HEAD'])
  const unstaged = parseShortstat(git(cwd, ['diff', '--shortstat']))
  const staged = parseShortstat(git(cwd, ['diff', '--cached', '--shortstat']))
  const porcelain = git(cwd, ['status', '--porcelain'])
  const ab = git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
  let ahead: number | null = null
  let behind: number | null = null
  if (ab) {
    const [a, b] = ab.split(/\s+/).map((n) => Number(n))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      ahead = a
      behind = b
    }
  }
  const value: GitInfo = {
    branch,
    insertions: unstaged.insertions + staged.insertions,
    deletions: unstaged.deletions + staged.deletions,
    ahead,
    behind,
    sha: sha || null,
    dirty: porcelain !== null && porcelain.length > 0,
  }
  cache.set(cwd, { token, expiry: now + TTL_MS, value })
  return value
}
