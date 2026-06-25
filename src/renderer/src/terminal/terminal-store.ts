/// <reference lib="dom" />
import {
  FLOW,
  type ReattachSnapshot,
  type TerminalApi,
} from "@shared/terminal";
import { editSequence } from "./key-bindings";

/** The xterm surface the store and the view actually use. Declared structurally so a real
 *  `@xterm/xterm` Terminal satisfies it AND a test fake can stand in without loading xterm. */
export interface XtermLike {
  write(data: string, callback?: () => void): void;
  onData(cb: (data: string) => void): { dispose(): void };
  /** Intercept keys before xterm processes them. Return false to suppress xterm's own handling (we
   *  send our own bytes); true to let xterm proceed. Real `@xterm/xterm` Terminal provides this. */
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void;
  dispose(): void;
  open(element: HTMLElement): void;
  focus(): void;
  loadAddon(addon: unknown): void;
  resize(cols: number, rows: number): void;
  readonly cols: number;
  readonly rows: number;
}

/** The fit addon surface the view uses. Real `@xterm/addon-fit` FitAddon satisfies it. */
export interface FitLike {
  fit(): void;
  proposeDimensions(): { cols: number; rows: number } | undefined;
}

/** One live terminal: the xterm instance, its fit addon, and a persistent wrapper div that moves
 *  between containers on attach/detach. `opened` guards the one-time `term.open`. On process exit the
 *  buffer is kept (the dim '[process exited]' line marks the end), so no separate flag is needed. */
export interface TerminalHandle {
  /** The session id this terminal currently writes. Mutable: a `/clear` rotates it (see `rename`), and the
   *  keystroke→pty sub and the output-ack callback read it through here so both follow the rotation. */
  id: string;
  term: XtermLike;
  fit: FitLike;
  wrapper: HTMLElement;
  /** Rebuild xterm's viewport scroll geometry against the live element (VSCode's forceRefresh →
   *  _core.viewport._innerRefresh). The view calls this on re-attach: background renders into the detached
   *  (offsetHeight 0) element shrink the scroll-area and reset scrollTop, leaving the Claude prompt
   *  unreachable until the geometry is rebuilt. Built in the factory (it needs the real xterm core). */
  rebuildViewport: () => void;
  opened: boolean;
  /** True while a reattach snapshot is being fetched after a window refresh. Live output is buffered in
   *  `replayQueue` (not written) until the snapshot lands, so the restored screen isn't clobbered by a
   *  mid-flight chunk. Set on a reattach create; cleared when `reattach` finishes. */
  replayPending: boolean;
  /** Live output buffered while the gate is up. Each chunk carries the cumulative output `offset` of its
   *  last char (matching the reattach snapshot's scale) so the flush can drop chunks the snapshot already
   *  covers — `offset: null` marks renderer-synthesized content (the exit notice) that is never in a
   *  snapshot and so always replays. */
  replayQueue: Array<{ data: string; offset: number | null }>;
  /** True while `reattach` is fetching the snapshot. The view re-arms reattach off `replayPending` on
   *  every layout sync, so a remount (a collapsed tab switched into, StrictMode's double-mount) can call
   *  `reattach` again while the first fetch is still in flight; this latch makes the second call a no-op
   *  so the snapshot isn't fetched and written twice. */
  reattaching: boolean;
}

export interface TerminalStoreDeps {
  api: TerminalApi;
  /** Build a fresh xterm + fit + wrapper. Injected so the store is testable without a real DOM. */
  createTerminal: () => {
    term: XtermLike;
    fit: FitLike;
    wrapper: HTMLElement;
    rebuildViewport: () => void;
  };
  /** True on macOS. Gates the cmd/option editing keys so we never hijack Super+arrow elsewhere. */
  isMac: boolean;
}

export interface TerminalStore {
  /** Get-or-create the handle for `id`. Idempotent: the same xterm instance (and its scrollback)
   *  survives every tab switch until `dispose`. Pass `replayOnCreate` when standing a terminal up to
   *  REATTACH a still-live pty after a window refresh — the handle gates live output until `reattach`
   *  replays the screen snapshot. Omit it for a fresh spawn/adopt/fork (output streams from the start). */
  create(id: string, opts?: { replayOnCreate?: boolean }): TerminalHandle;
  get(id: string): TerminalHandle | undefined;
  /** Re-key a live terminal from `from` to `to` (a `/clear` rotation), so pushed output and the user's
   *  keystrokes follow the rotated session id onto the SAME xterm — no flicker, scrollback intact. No-op
   *  if `from` has no handle or `to` is already taken. */
  rename(from: string, to: string): void;
  /** Close a terminal for good: dispose the xterm and forget the id. */
  dispose(id: string): void;
  /** Fetch the screen snapshot for a reattaching terminal, write it, then flush any output that queued
   *  while the gate was up, and open the gate. No-op if the handle isn't gated. */
  reattach(id: string, cols: number, rows: number): Promise<void>;
}

/**
 * Holds every Managed terminal alive for the app's lifetime. A single multiplexed subscription to the
 * push channels routes each chunk to its handle by id — so output keeps filling a terminal's buffer
 * even while its DOM is detached (the basis of lossless tab switching). Each xterm write carries an ack
 * callback; when xterm finishes parsing, the consumed chars are credited back to the pty, batched into
 * FLOW.ackChars messages so it's not one IPC per write. This is VSCode's ack-on-xterm-parse loop,
 * scaled down.
 */
export function createTerminalStore({
  api,
  createTerminal,
  isMac,
}: TerminalStoreDeps): TerminalStore {
  const handles = new Map<string, TerminalHandle>();
  const pendingAck = new Map<string, number>(); // consumed-but-unsent ack chars, per id

  function ackConsumed(id: string, n: number): void {
    if (!handles.has(id)) return; // terminal already disposed — drop the late ack, don't resurrect state
    let pending = (pendingAck.get(id) ?? 0) + n;
    while (pending >= FLOW.ackChars) {
      api.ack(id, FLOW.ackChars);
      pending -= FLOW.ackChars;
    }
    pendingAck.set(id, pending);
  }

  // Subscribe ONCE, at construction — the singleton is built at app startup — so the multiplexed
  // routing is live before any session spawns.
  api.onData((id, data, offset) => {
    const h = handles.get(id);
    // No handle for this id (already disposed, or a stray after teardown): we can't render it, but the
    // manager already counted these chars as unacked, so ack them straight back. Dropping them silently
    // would leak flow-control credit and could wedge a paused pty (see FLOW's invariant).
    if (!h) {
      api.ack(id, data.length);
      return;
    }
    if (h.replayPending) {
      // Reattaching after a refresh: hold live output until the snapshot is replayed (see `reattach`), so
      // the snapshot lands first. Keep each chunk's end offset so the flush can drop what the snapshot
      // already covers. Ack now — the snapshot is delivered out-of-band via api.reattach(), so these chars
      // still have to credit the pty or a paused pty could wedge (FLOW's invariant).
      h.replayQueue.push({ data, offset });
      api.ack(id, data.length);
      return;
    }
    // Ack under the handle's CURRENT id (read when xterm finishes parsing), so output that arrived just
    // before a /clear rename still credits the live pty under its new id instead of being dropped as a
    // stale ack — which would leak flow-control credit and could wedge a paused pty.
    h.term.write(data, () => ackConsumed(h.id, data.length));
  });
  api.onExit((id, code) => {
    const h = handles.get(id);
    if (!h) return;
    // Keep the scrollback; just mark the end inline (dim).
    const notice = `\r\n\x1b[2m[process exited${code ? ` (${code})` : ""}]\x1b[0m\r\n`;
    if (h.replayPending) {
      // A reattach is in flight: queue the notice behind the gate, exactly like live output (see onData),
      // so it lands AFTER the snapshot and queued output instead of on top of the fresh xterm — otherwise
      // the snapshot replay would bury (or, on an alt-screen TUI, hide) an exit marker written first. The
      // notice is renderer-synthesized, not pty output, so offset is null — it's never in a snapshot and
      // always replays.
      h.replayQueue.push({ data: notice, offset: null });
      return;
    }
    h.term.write(notice);
  });

  return {
    create(id, opts) {
      const existing = handles.get(id);
      if (existing) return existing;
      const { term, fit, wrapper, rebuildViewport } = createTerminal();
      const handle: TerminalHandle = {
        id,
        term,
        fit,
        wrapper,
        rebuildViewport,
        opened: false,
        replayPending: opts?.replayOnCreate ?? false,
        replayQueue: [],
        reattaching: false,
      };
      // user keystrokes → pty (independent of DOM attach). Reads handle.id so a rename re-points input too.
      term.onData((data) => api.write(handle.id, data));
      // Keystrokes the Claude Code prompt understands but xterm won't emit on its own (see
      // key-bindings): Shift+Enter → newline on every platform, plus cmd/option + arrows and deletes
      // → readline control bytes on macOS. Reads handle.id so input still follows a /clear rename.
      term.attachCustomKeyEventHandler((e) => {
        const seq = editSequence(e, isMac);
        if (seq === null) return true; // not ours — plain keys, copy/paste, etc.
        e.preventDefault();
        api.write(handle.id, seq);
        return false; // we sent the bytes; stop xterm emitting its own sequence
      });
      handles.set(id, handle);
      return handle;
    },
    get: (id) => handles.get(id),
    rename(from, to) {
      if (from === to) return;
      const h = handles.get(from);
      if (!h || handles.has(to)) return; // unknown source, or target already in use → no-op
      handles.delete(from);
      h.id = to; // the keystroke sub and ack callback read this, so both follow the rotation
      handles.set(to, h);
      const pend = pendingAck.get(from);
      pendingAck.delete(from);
      if (pend !== undefined) pendingAck.set(to, pend);
    },
    dispose(id) {
      const h = handles.get(id);
      if (!h) return;
      h.term.dispose();
      handles.delete(id);
      pendingAck.delete(id);
    },
    async reattach(id, cols, rows) {
      const h = handles.get(id);
      if (!h || !h.replayPending || h.reattaching) return; // not gated, or a fetch is already in flight
      h.reattaching = true;
      let snap: ReattachSnapshot | null = null;
      try {
        snap = await api.reattach(id, cols, rows);
      } catch {
        // Swallow a transient IPC failure: the sole caller floats this as `void reattach(...)`, so a
        // re-throw would surface as an unhandledrejection in the renderer. We lose the snapshot but
        // still open the gate below so live output resumes instead of stranding behind it.
      }
      // Open the gate even if api.reattach rejected (snap stays null on failure): otherwise a transient
      // IPC failure would strand the terminal gated forever (queuing + acking live output but never
      // rendering it). A /clear rename keeps the SAME handle object (re-keyed), so operate on the captured
      // `h`; bail if it's no longer the live handle for its id (a dispose during the await removes it from
      // the map, and writing to a disposed xterm would throw) or already flushed.
      if (handles.get(h.id) === h && h.replayPending) {
        // The snapshot already shows every output char up to `cutoff`; -1 when there's no snapshot, so
        // nothing is treated as covered. Writes carry no ack callback — queued chunks were acked already.
        const cutoff = snap ? snap.offset : -1;
        if (snap) h.term.write(snap.data);
        for (const item of h.replayQueue) {
          if (item.offset === null) {
            h.term.write(item.data); // synthetic (exit notice) — never in the snapshot, always replay
            continue;
          }
          if (item.offset <= cutoff) continue; // every char already in the snapshot — drop it, no double render
          const start = item.offset - item.data.length;
          // Whole chunk if it starts after the cutoff; otherwise it straddles, so replay only its tail.
          h.term.write(
            start >= cutoff ? item.data : item.data.slice(cutoff - start),
          );
        }
        h.replayQueue = [];
        h.replayPending = false;
      }
      // Drop the in-flight latch. On success/failure the gate is now open (replayPending false), so this is
      // just cleanup; if the handle was disposed mid-await it's an orphan and this is harmless either way.
      h.reattaching = false;
    },
  };
}
