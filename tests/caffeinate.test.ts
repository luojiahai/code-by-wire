import { describe, it, expect } from "vitest";
import {
  createCaffeinate,
  type CaffeinateBlocker,
} from "../src/main/caffeinate";

/** A fake blocker recording every start/stop; isStarted reads through the log, so a test can
 *  stop a blocker "out from under" the module to simulate the OS dropping it. Ids are 1, 2, 3… */
function fakeBlocker(): CaffeinateBlocker & {
  started: string[];
  stopped: number[];
} {
  const started: string[] = [];
  const stopped: number[] = [];
  return {
    started,
    stopped,
    start(type) {
      started.push(type);
      return started.length;
    },
    stop(id) {
      stopped.push(id);
    },
    isStarted(id) {
      return id >= 1 && id <= started.length && !stopped.includes(id);
    },
  };
}

describe("createCaffeinate", () => {
  it("starts off without touching the blocker", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    expect(caff.isOn()).toBe(false);
    expect(blocker.started).toEqual([]);
  });

  it("set(true) starts one prevent-app-suspension blocker and reports on", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    expect(caff.set(true)).toBe(true);
    expect(caff.isOn()).toBe(true);
    expect(blocker.started).toEqual(["prevent-app-suspension"]);
  });

  it("set(true) twice starts exactly one blocker", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    caff.set(true);
    expect(caff.set(true)).toBe(true);
    expect(blocker.started).toHaveLength(1);
  });

  it("set(false) stops the active blocker and reports off", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    caff.set(true);
    expect(caff.set(false)).toBe(false);
    expect(caff.isOn()).toBe(false);
    expect(blocker.stopped).toEqual([1]);
  });

  it("set(false) while off is a no-op, and a second set(false) never double-stops", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    expect(caff.set(false)).toBe(false); // never on: nothing to stop
    caff.set(true);
    caff.set(false);
    expect(caff.set(false)).toBe(false);
    expect(blocker.stopped).toEqual([1]);
  });

  it("on → off → on starts a fresh blocker for the second on", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    caff.set(true);
    caff.set(false);
    expect(caff.set(true)).toBe(true);
    expect(blocker.started).toHaveLength(2);
    expect(blocker.stopped).toEqual([1]);
  });

  it("isOn() reads through isStarted, and set(true) recovers an externally-stopped blocker", () => {
    const blocker = fakeBlocker();
    const caff = createCaffeinate({ blocker });
    caff.set(true);
    blocker.stop(1); // the OS dropped it out from under us
    expect(caff.isOn()).toBe(false);
    expect(caff.set(true)).toBe(true); // starts a fresh one instead of trusting the stale id
    expect(blocker.started).toHaveLength(2);
  });
});
