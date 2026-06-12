import { describe, it, expect } from "vitest";
import { createDataBufferer } from "../../src/main/terminal/data-bufferer";

/** A fake scheduler: captures the pending callback so the test fires the "timer" by hand. */
function fakeTimers() {
  let pending: (() => void) | null = null;
  return {
    setTimer: (cb: () => void) => {
      pending = cb;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {
      pending = null;
    },
    fire: () => {
      const cb = pending;
      pending = null;
      cb?.();
    },
    armed: () => pending !== null,
  };
}

describe("createDataBufferer", () => {
  it("coalesces a burst into one flush after the throttle window", () => {
    const t = fakeTimers();
    const out: string[] = [];
    const buf = createDataBufferer((d) => out.push(d), {
      throttleMs: 5,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    buf.add("a");
    buf.add("b");
    buf.add("c");
    expect(out).toEqual([]); // nothing emitted until the window elapses
    expect(t.armed()).toBe(true);

    t.fire(); // simulate the 5ms timer
    expect(out).toEqual(["abc"]); // one coalesced message
    expect(t.armed()).toBe(false); // timer disarmed after flush
  });

  it("arms a fresh timer for the next burst", () => {
    const t = fakeTimers();
    const out: string[] = [];
    const buf = createDataBufferer((d) => out.push(d), {
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    buf.add("x");
    t.fire();
    buf.add("y");
    t.fire();
    expect(out).toEqual(["x", "y"]);
  });

  it("flush() emits synchronously and empties the buffer", () => {
    const t = fakeTimers();
    const out: string[] = [];
    const buf = createDataBufferer((d) => out.push(d), {
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    buf.add("tail");
    buf.flush();
    expect(out).toEqual(["tail"]);
    buf.flush(); // empty now → no extra emit
    expect(out).toEqual(["tail"]);
  });

  it("dispose() drops buffered data without flushing", () => {
    const t = fakeTimers();
    const out: string[] = [];
    const buf = createDataBufferer((d) => out.push(d), {
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    buf.add("z");
    buf.dispose();
    t.fire();
    expect(out).toEqual([]);
  });

  it("ignores add() after dispose() — a disposed bufferer never re-arms or emits", () => {
    const t = fakeTimers();
    const out: string[] = [];
    const buf = createDataBufferer((d) => out.push(d), {
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    buf.dispose();
    buf.add("late"); // a stray pty read after teardown
    expect(t.armed()).toBe(false); // no timer re-armed
    t.fire();
    expect(out).toEqual([]); // nothing emitted
  });
});
