export interface DataBufferer {
  /** Queue a chunk; arms the flush timer if it isn't already. */
  add(data: string): void;
  /** Emit whatever's queued right now (used to drain the tail before exit). */
  flush(): void;
  /** Drop queued data and disarm the timer, emitting nothing. */
  dispose(): void;
}

export interface BuffererOptions {
  /** Coalescing window (ms). VSCode uses 5. */
  throttleMs?: number;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

/**
 * Coalesce a burst of pty reads into one callback per ~throttleMs window — VSCode's TerminalDataBufferer.
 * The first chunk arms a timer; later chunks in the window just append. On fire (or an explicit flush)
 * the queued chunks are joined and emitted once. This turns thousands of tiny node-pty `onData` events
 * into a handful of batched IPC messages, which is the single biggest defense against flooding the
 * renderer. Timers are injected so the batching is unit-testable without real time.
 */
export function createDataBufferer(
  flush: (data: string) => void,
  opts: BuffererOptions = {},
): DataBufferer {
  const throttleMs = opts.throttleMs ?? 5;
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;

  let buffer: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function emit(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (buffer.length === 0) return;
    const data = buffer.join("");
    buffer = [];
    flush(data);
  }

  return {
    add(data) {
      if (disposed) return; // a late pty read after teardown must not resurrect the timer
      buffer.push(data);
      if (timer === null) timer = setTimer(emit, throttleMs);
    },
    flush: emit,
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      buffer = [];
    },
  };
}
