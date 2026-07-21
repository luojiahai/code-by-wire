import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rafCoalesce } from "../../src/renderer/src/shell/pane-shell/raf-coalesce";

// jsdom (without pretendToBeVisual) has no rAF — stub a manual frame queue so
// tests control exactly when frames fire.
let frames: Map<number, FrameRequestCallback>;
let nextId: number;

function fireFrame() {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, cb] of pending) cb(performance.now());
}

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rafCoalesce", () => {
  it("does not apply synchronously on push", () => {
    const apply = vi.fn();
    const c = rafCoalesce(apply);
    c.push(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies the latest value once per frame", () => {
    const apply = vi.fn();
    const c = rafCoalesce(apply);
    c.push(1);
    c.push(2);
    c.push(3);
    fireFrame();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(3);
  });

  it("schedules a new frame for pushes after a flush", () => {
    const apply = vi.fn();
    const c = rafCoalesce(apply);
    c.push(1);
    fireFrame();
    c.push(2);
    fireFrame();
    expect(apply.mock.calls).toEqual([[1], [2]]);
  });

  it("finish applies the pending value synchronously and cancels the frame", () => {
    const apply = vi.fn();
    const c = rafCoalesce(apply);
    c.push(7);
    c.finish();
    expect(apply).toHaveBeenCalledWith(7);
    fireFrame(); // the cancelled frame must not double-apply
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("finish with nothing pending is a no-op", () => {
    const apply = vi.fn();
    const c = rafCoalesce(apply);
    c.push(1);
    fireFrame();
    c.finish();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
