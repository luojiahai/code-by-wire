import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

/** Lines of scrollback the recorder keeps and serializes. The renderer xterm holds 5000 going forward;
 *  restoring this many lines of history on reattach is the approved memory/fidelity tradeoff. */
const RECORDER_SCROLLBACK = 1000;

/** Tracks one pty's screen state in a headless xterm so it can be replayed after a window refresh.
 *  Fed the SAME byte stream the renderer receives; `snapshot` serializes the current screen (scrollback,
 *  cursor, colors, modes, and the alternate-screen buffer if a TUI is on it) into escape sequences. */
export interface Recorder {
  /** Feed a chunk of pty output (called alongside the renderer send). */
  write(data: string): void;
  /** Keep the headless xterm sized to the pty so the serialized frame matches the renderer's grid. */
  resize(cols: number, rows: number): void;
  /** Serialize the current screen to escape sequences. Drains the parse queue first (xterm's write is
   *  async), so a snapshot taken right after a burst reflects that burst. */
  snapshot(): Promise<string>;
  dispose(): void;
}

export function createRecorder({
  cols,
  rows,
}: {
  cols: number;
  rows: number;
}): Recorder {
  // allowProposedApi: the serialize addon reaches internal buffer APIs (VSCode's XtermSerializer sets it).
  const term = new Terminal({
    cols,
    rows,
    scrollback: RECORDER_SCROLLBACK,
    allowProposedApi: true,
  });
  const serialize = new SerializeAddon();
  term.loadAddon(serialize);

  return {
    write: (data) => term.write(data),
    resize: (c, r) => term.resize(c, r),
    snapshot: async () => {
      // Drain: an empty write's callback fires after all queued writes are parsed (writes are FIFO).
      await new Promise<void>((resolve) => term.write("", resolve));
      // Default options: alt buffer + modes INCLUDED. Our pty stays alive across the refresh, so we
      // restore exactly what it last drew — the deliberate divergence from VSCode's normal-buffer-only
      // persistence (which respawns the process).
      return serialize.serialize({ scrollback: RECORDER_SCROLLBACK });
    },
    dispose: () => term.dispose(),
  };
}
