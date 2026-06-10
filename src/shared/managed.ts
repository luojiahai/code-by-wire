import type { Session } from './types'

/**
 * Merge freshly-discovered sessions with optimistic Managed drafts (sessions the app spawned this run
 * that discovery hasn't indexed yet). A real row always wins over a draft of the same id, so the moment
 * discovery sees the spawned process the draft is shadowed; drafts with no real row yet are appended.
 * That keeps a just-created Managed session visible in the Overview and openable during the gap between
 * spawn and Claude writing its registry file + transcript.
 */
export function mergeManaged(sessions: Session[], drafts: Session[]): Session[] {
  const real = new Set(sessions.map((s) => s.id))
  return [...sessions, ...drafts.filter((d) => !real.has(d.id))]
}

/**
 * Apply the optimistic Adopt override. An id the user adopted this run, before the next sync relabels it,
 * is forced to Managed (and Ended → Working) so the workspace flips from the read-only Transcript to the
 * live terminal in the same beat. Unlike a draft, the row already exists, so this overrides in place. App
 * clears the id once discovery reports it Managed, or when its pty exits.
 */
export function applyAdopting(sessions: Session[], adopting: Set<string>): Session[] {
  if (adopting.size === 0) return sessions
  return sessions.map((s) =>
    adopting.has(s.id) ? { ...s, management: 'managed', state: s.state === 'ended' ? 'working' : s.state } : s,
  )
}
