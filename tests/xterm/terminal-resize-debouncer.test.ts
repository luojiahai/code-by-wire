import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TerminalResizeDebouncer,
  type TerminalResizeDebouncerOptions,
} from "../../src/renderer/src/xterm/terminal-resize-debouncer";

function makeDebouncer(over: Partial<TerminalResizeDebouncerOptions> = {}) {
  const calls = {
    both: [] as Array<[number, number]>,
    x: [] as number[],
    y: [] as number[],
  };
  const debouncer = new TerminalResizeDebouncer({
    getBufferLength: () => 1000,
    isVisible: () => true,
    resizeBoth: (c, r) => calls.both.push([c, r]),
    resizeX: (c) => calls.x.push(c),
    resizeY: (r) => calls.y.push(r),
    ...over,
  });
  return { debouncer, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TerminalResizeDebouncer (vscode terminalResizeDebouncer.ts semantics)", () => {
  it("small buffers resize both axes immediately", () => {
    const { debouncer, calls } = makeDebouncer({ getBufferLength: () => 10 });
    debouncer.resize(80, 24);
    expect(calls.both).toEqual([[80, 24]]);
  });

  it("immediate=true bypasses debouncing regardless of buffer size", () => {
    const { debouncer, calls } = makeDebouncer();
    debouncer.resize(80, 24, true);
    expect(calls.both).toEqual([[80, 24]]);
  });

  it("visible + large buffer: rows apply now, cols debounce 100ms and coalesce", () => {
    const { debouncer, calls } = makeDebouncer();
    debouncer.resize(80, 24);
    debouncer.resize(90, 25);
    expect(calls.y).toEqual([24, 25]);
    expect(calls.x).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(calls.x).toEqual([90]); // only the latest cols, once
  });

  it("not visible: both axes defer to idle and coalesce to the latest values", () => {
    const { debouncer, calls } = makeDebouncer({ isVisible: () => false });
    debouncer.resize(80, 24);
    debouncer.resize(90, 25);
    expect(calls.x).toEqual([]);
    expect(calls.y).toEqual([]);
    vi.advanceTimersByTime(50); // jsdom has no requestIdleCallback -> 16ms fallback
    expect(calls.x).toEqual([90]);
    expect(calls.y).toEqual([25]);
  });

  it("flush cancels pending work and applies the latest size once", () => {
    const { debouncer, calls } = makeDebouncer();
    debouncer.resize(80, 24);
    debouncer.flush();
    expect(calls.both).toEqual([[80, 24]]);
    vi.advanceTimersByTime(200);
    expect(calls.x).toEqual([]); // the scheduled X job was cancelled
  });

  it("flush with nothing pending is a no-op", () => {
    const { debouncer, calls } = makeDebouncer();
    debouncer.flush();
    expect(calls.both).toEqual([]);
  });

  it("dispose cancels pending timers so nothing fires against a torn-down xterm", () => {
    const { debouncer, calls } = makeDebouncer();
    debouncer.resize(80, 24);
    debouncer.dispose();
    vi.advanceTimersByTime(200);
    expect(calls.x).toEqual([]);
  });
});
