import { describe, it, expect } from 'vitest'
import { deriveSessionState } from '../../src/main/provider/claude/state'

describe('deriveSessionState', () => {
  it('is working when alive and generating', () => {
    expect(deriveSessionState({ alive: true, status: 'busy', awaitingUser: false })).toBe('working')
  })

  it('is waiting when alive, quiet, and blocked on an unanswered prompt', () => {
    expect(deriveSessionState({ alive: true, status: 'idle', awaitingUser: true })).toBe('waiting')
  })

  it('is waiting when the session file status says so, even with no transcript signal', () => {
    // Claude Code writes status "waiting" directly when a session is blocked on the user;
    // it's the primary, authoritative signal. awaitingUser is only a transcript fallback.
    expect(deriveSessionState({ alive: true, status: 'waiting', awaitingUser: false })).toBe('waiting')
  })

  it('is idle when alive, quiet, and the last turn is finished', () => {
    expect(deriveSessionState({ alive: true, status: 'idle', awaitingUser: false })).toBe('idle')
  })

  it('is ended when the process is gone', () => {
    expect(deriveSessionState({ alive: false, status: 'idle', awaitingUser: false })).toBe('ended')
  })

  it('resolves precedence: gone beats all, generating beats an unanswered prompt', () => {
    // A gone process is Ended even if its last status was busy with a pending prompt.
    expect(deriveSessionState({ alive: false, status: 'busy', awaitingUser: true })).toBe('ended')
    // A live, generating session is Working even with a tool mid-flight (not blocked on us).
    expect(deriveSessionState({ alive: true, status: 'busy', awaitingUser: true })).toBe('working')
    // An absent status is not "busy", so a pending prompt surfaces as Waiting.
    expect(deriveSessionState({ alive: true, status: undefined, awaitingUser: true })).toBe('waiting')
  })
})
