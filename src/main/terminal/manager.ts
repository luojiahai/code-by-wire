import type { ModelId } from '@shared/models'
import { FLOW } from '@shared/terminal'
import { buildClaudeCommand, buildResumeCommand, type ClaudeCommand } from './command'
import { createDataBufferer, type DataBufferer } from './data-bufferer'
// Type-only: importing pty-process for VALUES would pull node-pty (a native addon) into the test
// graph and break `pnpm test`. The real factory is injected at the composition root (the IPC layer).
import type { PtyProcess, SpawnOptions } from './pty-process'

interface Term {
  /** The session id this pty currently writes. Mutable: a `/clear` rotates it (see `rename`), and the
   *  pty's output/exit closures read it through here so they follow the rotation. */
  id: string
  pty: PtyProcess
  bufferer: DataBufferer
  /** Chars sent to the renderer but not yet acked — the flow-control credit. */
  unacked: number
  paused: boolean
}

export interface SpawnRequest {
  id: string
  cwd: string
  model: ModelId
  cols: number
  rows: number
}

export interface AdoptSpawn {
  id: string
  cwd: string
  cols: number
  rows: number
}

export interface TerminalManagerDeps {
  /** Push a batched output chunk for `id` to the renderer. */
  send: (id: string, data: string) => void
  /** Tell the renderer a session's process exited. */
  notifyExit: (id: string, exitCode: number) => void
  /** Record `id` as Managed (the registry's `add`), anchored to its pty's `pid`, so discovery labels it
   *  and can follow it across a `/clear` that rotates the session id under the same pid. */
  onSpawned: (id: string, pid: number) => void
  /** Drop `id`'s Managed label (the registry's `remove`) once its pty is gone — natural exit or a
   *  disposeAll on window close — so Managed-ness stays anchored to the pty's actual lifetime and a
   *  reopened window doesn't resurrect a dead session as Managed. */
  onClosed: (id: string) => void
  /** The node-pty factory. REQUIRED (injected at the composition root, not defaulted) so the manager
   *  carries no value import of node-pty and stays unit-testable with a fake. */
  createPty: (o: SpawnOptions) => PtyProcess
  /** Injected in tests; defaults to the 5ms coalescer (pure, safe to import here). */
  createBufferer?: (flush: (data: string) => void) => DataBufferer
  /** Child env; defaults to the app's (PATH must carry `claude` under `pnpm dev`). */
  env?: NodeJS.ProcessEnv
}

export interface TerminalManager {
  spawn(req: SpawnRequest): void
  /** Resume an Ended session under its own id with `claude --resume <id>` — same pty machinery as spawn. */
  adopt(req: AdoptSpawn): void
  /** Re-key a live pty from its old session id to a new one (a `/clear` rotation), so its output, writes,
   *  and exit all flow under the new id. No-op if `from` isn't live or `to` is already taken. */
  rename(from: string, to: string): void
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  /** Credit `charCount` of consumed output back; resumes node-pty if the backlog drains enough. */
  ack(id: string, charCount: number): void
  kill(id: string): void
  /** Kill every pty (window closed / app quit) — Managed sessions don't outlive the app. */
  disposeAll(): void
}

/**
 * One pty per pinned session id. Output flows pty → 5ms bufferer → send(id, chunk); on each read the
 * unacked-char count climbs, and once it passes FLOW.highWaterChars the pty is paused at the source
 * (VSCode's backpressure). The renderer acks consumed output (each ack tied to xterm finishing its
 * write); `ack` decrements the credit and resumes the pty once it falls below FLOW.lowWaterChars. So
 * the whole pipeline self-throttles to the terminal's render speed instead of drowning it.
 */
export function createTerminalManager(deps: TerminalManagerDeps): TerminalManager {
  const createPty = deps.createPty
  const createBufferer = deps.createBufferer ?? createDataBufferer
  const env = deps.env ?? process.env
  const terms = new Map<string, Term>()

  // Stand up one pty for `id` running `command` in `cwd`. The body is identical for a fresh spawn and an
  // Adopt; only the argv differs, so both funnel here.
  function start(id: string, command: ClaudeCommand, cwd: string, cols: number, rows: number): void {
    if (terms.has(id)) return // idempotent — a double start of one id is a no-op
    const pty = createPty({ file: command.file, args: command.args, cwd, env, cols, rows })
    // The flush reads `term.id`, not the captured `id`, so a rename re-points output without rewiring the
    // bufferer. Safe to reference `term` before its declaration: the closure only runs once data flows.
    const bufferer = createBufferer((data) => deps.send(term.id, data))
    const term: Term = { id, pty, bufferer, unacked: 0, paused: false }
    terms.set(id, term)

    pty.onData((data) => {
      term.unacked += data.length
      if (!term.paused && term.unacked > FLOW.highWaterChars) {
        term.paused = true
        pty.pause()
      }
      bufferer.add(data)
    })

    pty.onExit(({ exitCode }) => {
      if (!terms.has(term.id)) return // torn down by disposeAll, not a natural exit
      bufferer.flush() // drain the tail of output instead of stranding it behind the 5ms timer
      bufferer.dispose()
      terms.delete(term.id)
      deps.onClosed(term.id) // pty is gone → drop the Managed label so it re-derives as Observed
      deps.notifyExit(term.id, exitCode)
    })

    deps.onSpawned(id, pty.pid)
  }

  function spawn(req: SpawnRequest): void {
    start(req.id, buildClaudeCommand({ id: req.id, model: req.model }), req.cwd, req.cols, req.rows)
  }

  // Adopt: resume an Ended session under its OWN id. The resume argv carries no --model (the CLI restores
  // the session's model), so there is no `model` in the request.
  function adopt(req: AdoptSpawn): void {
    start(req.id, buildResumeCommand({ id: req.id }), req.cwd, req.cols, req.rows)
  }

  function ack(id: string, charCount: number): void {
    const term = terms.get(id)
    if (!term) return
    term.unacked = Math.max(0, term.unacked - charCount)
    if (term.paused && term.unacked < FLOW.lowWaterChars) {
      term.paused = false
      term.pty.resume()
    }
  }

  // Follow a /clear: the pty lives on, its session id moved. Re-key the terms map and update the term's
  // own id so the output/exit closures (which read term.id) re-point too. The registry rename and the
  // renderer hand-off are the caller's job; this owns only the pty side.
  function rename(from: string, to: string): void {
    if (from === to) return
    const term = terms.get(from)
    if (!term || terms.has(to)) return // unknown source, or target id already in use → no-op
    terms.delete(from)
    term.id = to
    terms.set(to, term)
  }

  return {
    spawn,
    adopt,
    rename,
    write: (id, data) => terms.get(id)?.pty.write(data),
    resize: (id, cols, rows) => terms.get(id)?.pty.resize(cols, rows),
    ack,
    kill: (id) => terms.get(id)?.pty.kill(),
    disposeAll: () => {
      for (const [id, term] of terms) {
        term.bufferer.dispose()
        terms.delete(id)
        term.pty.kill()
        deps.onClosed(id) // window closing → the pty dies, so drop its Managed label too
      }
      terms.clear()
    },
  }
}
