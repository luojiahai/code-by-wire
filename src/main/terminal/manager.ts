import type { Family, ModelSelection } from "@shared/models";
import { FLOW, type ReattachSnapshot } from "@shared/terminal";
import {
  buildClaudeCommand,
  buildResumeCommand,
  buildForkCommand,
  launchForm,
  type ClaudeCommand,
} from "./command";
import { createDataBufferer, type DataBufferer } from "./data-bufferer";
import { isDirectory } from "../fs-dir";
// Type-only: importing pty-process for VALUES would pull node-pty (a native addon) into the test
// graph and break `pnpm test`. The real factory is injected at the composition root (the IPC layer).
import type { PtyProcess, SpawnOptions } from "./pty-process";
import type { Recorder } from "./recorder";

interface Term {
  /** The session id this pty currently writes. Mutable: a `/clear` rotates it (see `rename`), and the
   *  pty's output/exit closures read it through here so they follow the rotation. */
  id: string;
  pty: PtyProcess;
  bufferer: DataBufferer;
  recorder: Recorder;
  /** Chars sent to the renderer but not yet acked — the flow-control credit. */
  unacked: number;
  /** Cumulative output chars sent to the renderer — stamped on each chunk as its end offset so a
   *  reattaching renderer can dedupe the snapshot against in-flight output. Same scale as the recorder's
   *  `written` (both count the identical stream), so the snapshot offset and chunk offsets are comparable. */
  out: number;
  paused: boolean;
}

export interface SpawnRequest {
  id: string;
  cwd: string;
  model: ModelSelection;
  cols: number;
  rows: number;
  bin?: string;
}

export interface AdoptSpawn {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
  bin?: string;
}

export interface ForkSpawn {
  /** The pinned NEW id for the fork, minted by the caller, under which the pty registers Managed. */
  id: string;
  /** The source session whose conversation is resumed into the fork (read-only — its Transcript is
   *  untouched; the fork writes its own under `id`). */
  sourceId: string;
  /** The source's model family, recorded as the fork's picked alias (like spawn's `model`) so the
   *  provider can front the right model until the fork records its first assistant turn. The
   *  --fork-session argv carries no --model — the fork restores the real model itself — but without the
   *  picked alias the pre-first-turn fork would display the default fallback instead of the source's. */
  model: Family;
  cwd: string;
  cols: number;
  rows: number;
  bin?: string;
}

export interface TerminalManagerDeps {
  /** Push a batched output chunk for `id` to the renderer. `offset` is the cumulative count of output
   *  chars through the end of this chunk, so a reattaching renderer can dedupe a snapshot against it. */
  send: (id: string, data: string, offset: number) => void;
  /** Tell the renderer a session's process exited. */
  notifyExit: (id: string, exitCode: number) => void;
  /** Record `id` as Managed (the registry's `add`), anchored to its pty's `pid`, so discovery labels it
   *  and can follow it across a `/clear` that rotates the session id under the same pid. `model` is the
   *  picked alias for a fresh spawn (undefined on Adopt, which restores the model via the CLI), so the
   *  provider can front it before the first assistant turn records a real model. */
  onSpawned: (id: string, pid: number, model?: Family) => void;
  /** Drop `id`'s Managed label (the registry's `remove`) once its pty is gone — natural exit or a
   *  disposeAll on window close — so Managed-ness stays anchored to the pty's actual lifetime and a
   *  reopened window doesn't resurrect a dead session as Managed. */
  onClosed: (id: string) => void;
  /** The node-pty factory. REQUIRED (injected at the composition root, not defaulted) so the manager
   *  carries no value import of node-pty and stays unit-testable with a fake. */
  createPty: (o: SpawnOptions) => PtyProcess;
  /** Injected in tests; defaults to the 5ms coalescer (pure, safe to import here). */
  createBufferer?: (flush: (data: string) => void) => DataBufferer;
  /** The headless-xterm recorder factory. REQUIRED (injected at the composition root, like createPty) so
   *  the manager carries no value import of @xterm/headless and tests inject a fake. */
  createRecorder: (o: { cols: number; rows: number }) => Recorder;
  /** Returns the child env, resolved at spawn time; defaults to the app's `process.env` (whose PATH must
   *  carry `claude`, as under `pnpm dev`). A thunk so a costly PATH probe runs lazily, not at startup. */
  env?: () => NodeJS.ProcessEnv;
  /** Host platform; injected so the Windows launch shim is unit-testable. Defaults to process.platform. */
  platform?: NodeJS.Platform;
  /** Validates a session's cwd before spawn. Injected in tests; defaults to a real statSync isDirectory
   *  check — a node:fs call, not the native pty addon, so it is safe here and tests inject a fake. */
  statDir?: (cwd: string) => boolean;
}

export interface TerminalManager {
  spawn(req: SpawnRequest): void;
  /** Resume an Ended session under its own id with `claude --resume <id>` — same pty machinery as spawn. */
  adopt(req: AdoptSpawn): void;
  /** Fork a session: resume `sourceId`'s conversation into a fresh `id` with `--fork-session`, so the
   *  source Transcript is left intact and the fork writes its own. Same pty machinery as spawn/adopt. */
  fork(req: ForkSpawn): void;
  /** Re-key a live pty from its old session id to a new one (a `/clear` rotation), so its output, writes,
   *  and exit all flow under the new id. No-op if `from` isn't live or `to` is already taken. */
  rename(from: string, to: string): void;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  /** Credit `charCount` of consumed output back; resumes node-pty if the backlog drains enough. */
  ack(id: string, charCount: number): void;
  kill(id: string): void;
  /** Kill every pty (window closed / app quit) — Managed sessions don't outlive the app. */
  disposeAll(): void;
  /** Serialize the current screen for `id` (for replay after a window refresh) with the output offset it
   *  covers, or null if no live pty. */
  snapshot(id: string): Promise<ReattachSnapshot | null>;
}

/**
 * One pty per pinned session id. Output flows pty → 5ms bufferer → send(id, chunk); on each read the
 * unacked-char count climbs, and once it passes FLOW.highWaterChars the pty is paused at the source
 * (VSCode's backpressure). The renderer acks consumed output (each ack tied to xterm finishing its
 * write); `ack` decrements the credit and resumes the pty once it falls below FLOW.lowWaterChars. So
 * the whole pipeline self-throttles to the terminal's render speed instead of drowning it.
 */
export function createTerminalManager(
  deps: TerminalManagerDeps,
): TerminalManager {
  const createPty = deps.createPty;
  const createBufferer = deps.createBufferer ?? createDataBufferer;
  const platform = deps.platform ?? process.platform;
  const statDir = deps.statDir ?? isDirectory;
  const terms = new Map<string, Term>();

  // Stand up one pty for `id` running `command` in `cwd`. The body is identical for a fresh spawn and an
  // Adopt; only the argv differs, so both funnel here.
  function start(
    id: string,
    command: ClaudeCommand,
    cwd: string,
    cols: number,
    rows: number,
    model?: Family,
  ): void {
    if (terms.has(id)) return; // idempotent — a double start of one id is a no-op
    if (!statDir(cwd)) {
      // A bad cwd makes node-pty throw asynchronously and surface as a bare "[process exited]". Validate
      // up front and surface the reason through the existing channels instead. No pty is created, so
      // onSpawned never fires and the session is never labelled Managed. Both spawn and adopt funnel
      // through start(), so this guard covers adopt too; its IPC handler has already returned { ok: true },
      // so the message and exit supersede the optimistic "adopting" state.
      // No pty/recorder for a failed spawn, so there's no reattach to dedupe against — the offset just
      // counts this lone message from zero.
      const msg = `\r\n\x1b[31mStarting directory does not exist: ${cwd}\x1b[0m\r\n`;
      deps.send(id, msg, msg.length);
      deps.notifyExit(id, 1);
      return;
    }
    // Resolve the child env here, not at construction: the PATH probe behind `deps.env` is a synchronous
    // shell spawn we keep off the startup path, so it runs (once, memoized) on the first real spawn.
    // Declare COLORTERM=truecolor on top: the pty's TERM is only xterm-256color (see pty-process), so
    // without this claude's color detection caps below 24-bit and quantizes its mascot orange to the
    // nearest 256-cube index — a visibly muted shade. A Finder-launched .app inherits launchd's bare env
    // (no COLORTERM), which is why this only bites the packaged build; dev and real terminals carry it.
    // Force it (not a default) because our WebGL terminal genuinely is 24-bit capable, so the declaration
    // is ours to make, not the launching shell's.
    const launched = launchForm(
      { file: command.file, args: command.args },
      platform,
    );
    const pty = createPty({
      file: launched.file,
      args: launched.args,
      cwd,
      env: { ...(deps.env?.() ?? process.env), COLORTERM: "truecolor" },
      cols,
      rows,
    });
    // The flush reads `term.id`, not the captured `id`, so a rename re-points output without rewiring the
    // bufferer. Safe to reference `term` before its declaration: the closure only runs once data flows.
    // It also advances `term.out` and stamps each chunk with that cumulative end offset, matching the
    // recorder's `written` scale so the renderer can dedupe a reattach snapshot against in-flight output.
    const bufferer = createBufferer((data) => {
      // Feed the recorder the COALESCED batch here, not each raw onData chunk: that's one full xterm parse
      // per ~5ms window instead of thousands of tiny writes into a second emulator during a flood. The
      // snapshot drains the bufferer first (see `snapshot`), so it never misses output still in the batch.
      term.recorder.write(data);
      term.out += data.length;
      deps.send(term.id, data, term.out);
    });
    const recorder = deps.createRecorder({ cols, rows });
    const term: Term = {
      id,
      pty,
      bufferer,
      recorder,
      unacked: 0,
      out: 0,
      paused: false,
    };
    terms.set(id, term);

    pty.onData((data) => {
      term.unacked += data.length;
      if (!term.paused && term.unacked > FLOW.highWaterChars) {
        term.paused = true;
        pty.pause();
      }
      bufferer.add(data); // coalesced, then fed to BOTH the recorder and the renderer in the flush above
    });

    pty.onExit(({ exitCode }) => {
      if (!terms.has(term.id)) return; // torn down by disposeAll, not a natural exit
      bufferer.flush(); // drain the tail of output instead of stranding it behind the 5ms timer
      bufferer.dispose();
      term.recorder.dispose();
      terms.delete(term.id);
      deps.onClosed(term.id); // pty is gone → drop the Managed label so it re-derives as Observed
      deps.notifyExit(term.id, exitCode);
    });

    deps.onSpawned(id, pty.pid, model);
  }

  function spawn(req: SpawnRequest): void {
    start(
      req.id,
      buildClaudeCommand({ id: req.id, model: req.model, bin: req.bin }),
      req.cwd,
      req.cols,
      req.rows,
      req.model === "default" ? undefined : req.model,
    );
  }

  // Adopt: resume an Ended session under its OWN id. The resume argv carries no --model (the CLI restores
  // the session's model), so there is no `model` in the request.
  function adopt(req: AdoptSpawn): void {
    start(
      req.id,
      buildResumeCommand({ id: req.id, bin: req.bin }),
      req.cwd,
      req.cols,
      req.rows,
    );
  }

  // Fork: resume the source conversation under a NEW id. Like adopt, the argv carries no --model (the
  // fork restores the source's model); unlike adopt, the id differs from the source, so the fork writes
  // its own Transcript and the original is left intact. We still pass the source model as the picked
  // alias (spawn's 6th arg) so the provider fronts it until the fork's first turn lands a real model —
  // otherwise a fork of, say, a Sonnet session would flash the default fallback before settling.
  function fork(req: ForkSpawn): void {
    start(
      req.id,
      buildForkCommand({ sourceId: req.sourceId, newId: req.id, bin: req.bin }),
      req.cwd,
      req.cols,
      req.rows,
      req.model,
    );
  }

  function ack(id: string, charCount: number): void {
    const term = terms.get(id);
    if (!term) return;
    term.unacked = Math.max(0, term.unacked - charCount);
    if (term.paused && term.unacked < FLOW.lowWaterChars) {
      term.paused = false;
      term.pty.resume();
    }
  }

  // Follow a /clear: the pty lives on, its session id moved. Re-key the terms map and update the term's
  // own id so the output/exit closures (which read term.id) re-point too. The registry rename and the
  // renderer hand-off are the caller's job; this owns only the pty side.
  function rename(from: string, to: string): void {
    if (from === to) return;
    const term = terms.get(from);
    if (!term || terms.has(to)) return; // unknown source, or target id already in use → no-op
    terms.delete(from);
    term.id = to;
    terms.set(to, term);
  }

  return {
    spawn,
    adopt,
    fork,
    rename,
    write: (id, data) => terms.get(id)?.pty.write(data),
    resize: (id, cols, rows) => {
      const term = terms.get(id);
      if (!term) return;
      term.pty.resize(cols, rows);
      term.recorder.resize(cols, rows);
    },
    ack,
    snapshot: async (id) => {
      const term = terms.get(id);
      if (!term) return null;
      // Drain any batched-but-unflushed output into the recorder (and the renderer) first — the recorder
      // is fed from the bufferer flush now, so without this the snapshot would miss the last <5ms of output.
      term.bufferer.flush();
      return term.recorder.snapshot();
    },
    // We kill the pty synchronously here and in disposeAll — on Windows too, unlike VSCode, which defers
    // an immediate kill on Windows to dodge a ConPTY hang. VSCode can afford the deferral because its
    // pty-host process outlives the window and force-kills after a timeout; we run ptys in the main
    // process and tear down on window-close / app-quit, where a deferred timer may never fire (the process
    // can exit first) and would orphan the claude child. So synchronous best-effort kill is correct here.
    // Killing the pty triggers pty.onExit, which disposes the bufferer and recorder — no explicit dispose
    // needed here. Killing an already-dead or unknown pty is a no-op.
    kill: (id) => terms.get(id)?.pty.kill(),
    disposeAll: () => {
      for (const [id, term] of terms) {
        // Order matters: delete first so the kill's onExit early-returns (no double dispose), then kill,
        // THEN dispose the sinks. A pty can flush a final onData synchronously as it's killed, and that
        // chunk routes through the bufferer into the recorder — both must still be alive when it lands.
        terms.delete(id);
        term.pty.kill();
        term.bufferer.dispose();
        term.recorder.dispose();
        deps.onClosed(id); // window closing → the pty dies, so drop its Managed label too
      }
      terms.clear();
    },
  };
}
