import { useEffect, useRef, useState } from "react";

/** How often the Observed view re-reads a session source. A poll, not a watcher: it matches the app's
 *  request/response IPC, and the read's change token makes an unchanged poll a cheap no-op (the main
 *  process skips the read+parse, the renderer skips the re-render). */
export const POLL_MS = 1500;

/** A read's outcome, parameterized by its payload: a fresh value with a change token the caller echoes
 *  back as `since`, the source unchanged, no source, or a transient failure. The transcript/tasks reads
 *  adapt their IPC result (`doc` / `tasks`) into the uniform `data` field. */
export type Read<T> =
  | { status: "changed"; mtimeMs: number; data: T }
  | { status: "unchanged"; mtimeMs: number }
  | { status: "absent" }
  | { status: "error" };

/**
 * Poll one session source on an interval, returning the latest value. Resets cleanly when the id
 * changes. Skips a poll while one is in flight (a slow read must not let polls overlap and apply out of
 * order) or while the window is hidden; reads immediately when the window returns to the foreground. A
 * transient error keeps the last value rather than blanking the view. Tri-state return: `undefined` =
 * the first read hasn't landed, `null` = read and the source is absent, a value once read.
 *
 * `enabled` (default true) gates the poll: when false the hook holds at `undefined` and never reads, so
 * a caller can mount it unconditionally and turn it on only when the source exists (e.g. the subagent
 * poll, lifted above the tab toggle, runs only while a lane is drilled).
 */
export function usePolledRead<T>(
  sessionId: string,
  read: (id: string, since?: number) => Promise<Read<T>>,
  enabled = true,
): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  const sinceRef = useRef<number | undefined>(undefined); // last seen change token (mtime)
  const inFlightRef = useRef(false);

  // Reset DURING render when the id changes (React's "adjusting state when a prop changes" pattern),
  // not only in the effect below: the effect is passive, so it runs after React commits — and the
  // browser paints — the first render of the new session, which exposed one frame of the OLD
  // session's value under the NEW session's identity (the cross-session Throughput flash on a
  // session switch). Setting state during render makes React discard this render's output and
  // re-render immediately, so a stale (new id, old value) pair is never committed. The effect keeps
  // ownership of the refs and the polling lifecycle.
  const [renderedId, setRenderedId] = useState(sessionId);
  if (renderedId !== sessionId) {
    setRenderedId(sessionId);
    setValue(undefined);
  }

  useEffect(() => {
    let alive = true;
    sinceRef.current = undefined;
    inFlightRef.current = false;
    setValue(undefined);
    if (!enabled) return; // disabled — hold at `undefined`, no interval, no listener

    async function poll() {
      if (inFlightRef.current || document.hidden) return;
      inFlightRef.current = true;
      try {
        const r = await read(sessionId, sinceRef.current);
        if (!alive) return;
        switch (r.status) {
          case "changed":
            sinceRef.current = r.mtimeMs;
            setValue(r.data);
            break;
          case "unchanged":
            break; // nothing moved — hold the current value
          case "absent":
            sinceRef.current = undefined;
            setValue(null);
            break;
          case "error":
            break; // transient — keep the last value, retry next poll
        }
      } catch {
        // IPC itself failed; treat like a transient error and keep the last value.
      } finally {
        if (alive) inFlightRef.current = false;
      }
    }

    void poll();
    const h = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(h);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, read, enabled]);

  return value;
}
