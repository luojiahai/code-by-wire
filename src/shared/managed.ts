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
