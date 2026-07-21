/** Coalesces a stream of values into one `apply` call per animation frame
 *  (latest value wins). `finish()` commits any pending value synchronously —
 *  call it from drag cleanup so the final position is never dropped. */
export function rafCoalesce<T>(apply: (value: T) => void): {
  push: (value: T) => void;
  finish: () => void;
} {
  let frame = 0;
  let pending: { value: T } | null = null;

  const flush = () => {
    frame = 0;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    apply(value);
  };

  return {
    push(value: T) {
      pending = { value };
      if (!frame) frame = window.requestAnimationFrame(flush);
    },
    finish() {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      flush();
    },
  };
}
