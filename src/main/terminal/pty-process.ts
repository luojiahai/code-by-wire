import { spawn, type IPty } from 'node-pty'

/** The narrow surface the manager drives. Matches node-pty's IPty subset we use, so a test fake can
 *  stand in for the real thing without pulling the native addon into the test runner. */
export interface PtyProcess {
  /** OS pid of the spawned `claude` process — the stable anchor for Managed-ness across a `/clear`,
   *  which rotates the session id under this same pid. */
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  /** Pause/resume reading from the pty — the source-side half of flow control (node-pty's stream API). */
  pause(): void
  resume(): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
}

export interface SpawnOptions {
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
}

/**
 * Wrap one node-pty process. The only module importing node-pty (a native addon rebuilt for Electron),
 * so the rest of the terminal stack — manager, bufferer, command — is pure and unit-testable. `resize`
 * clamps to at least 1×1 the way VSCode does, since a 0 dimension throws in the native layer.
 */
export function createPtyProcess(o: SpawnOptions): PtyProcess {
  const pty: IPty = spawn(o.file, o.args, {
    name: 'xterm-256color',
    cols: o.cols,
    rows: o.rows,
    cwd: o.cwd,
    env: o.env,
  })
  return {
    pid: pty.pid,
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(Math.max(cols, 1), Math.max(rows, 1)),
    pause: () => pty.pause(),
    resume: () => pty.resume(),
    kill: () => pty.kill(),
    onData: (cb) => {
      pty.onData(cb)
    },
    onExit: (cb) => {
      pty.onExit(cb)
    },
  }
}
