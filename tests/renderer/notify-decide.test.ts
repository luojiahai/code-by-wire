import { describe, it, expect } from "vitest";
import {
  decideNotifications,
  AWAITING_BODY,
  type AwaitingCandidate,
  type DecideInput,
} from "../../src/renderer/src/notifications/decide";
import type { SessionState } from "../../src/shared/types";

function row(
  id: string,
  state: SessionState,
  title = `Title ${id}`,
  project = `proj-${id}`,
): AwaitingCandidate {
  return { id, state, title, project };
}

/** Baseline defaults: enabled, window unfocused, nothing selected — the pure transition case. */
function input(
  partial: Partial<DecideInput> & Pick<DecideInput, "prev" | "sessions">,
): DecideInput {
  return {
    enabled: true,
    windowFocused: false,
    selectedId: null,
    ...partial,
  };
}

describe("decideNotifications", () => {
  it("never notifies on the first poll (no baseline yet), but seeds one", () => {
    const r = decideNotifications(
      input({
        prev: null,
        sessions: [row("a", "waiting"), row("b", "working")],
      }),
    );
    expect(r.notify).toEqual([]);
    expect(r.baseline.get("a")).toBe(true);
    expect(r.baseline.get("b")).toBe(false);
  });

  it("notifies on a false→true transition with the session title and the reason body", () => {
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "waiting", "Fix the tests")] }),
    );
    expect(r.notify).toEqual([
      { sessionId: "a", title: "Fix the tests", body: AWAITING_BODY },
    ]);
  });

  it("falls back to the project when the title is empty", () => {
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "waiting", "", "my-project")] }),
    );
    expect(r.notify[0]?.title).toBe("my-project");
  });

  it("does not re-notify a session that is still awaiting", () => {
    const prev = new Map([["a", true]]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "waiting")] }),
    );
    expect(r.notify).toEqual([]);
    expect(r.baseline.get("a")).toBe(true);
  });

  it("re-arms after the session stops awaiting: true→false→true fires again", () => {
    const p1 = decideNotifications(
      input({ prev: new Map([["a", true]]), sessions: [row("a", "working")] }),
    );
    expect(p1.notify).toEqual([]);
    expect(p1.baseline.get("a")).toBe(false);
    const p2 = decideNotifications(
      input({ prev: p1.baseline, sessions: [row("a", "waiting")] }),
    );
    expect(p2.notify.map((n) => n.sessionId)).toEqual(["a"]);
  });

  it("suppresses when the window is focused AND that session is selected", () => {
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({
        prev,
        sessions: [row("a", "waiting")],
        windowFocused: true,
        selectedId: "a",
      }),
    );
    expect(r.notify).toEqual([]);
    // The suppressed transition still lands in the baseline: blurring later must not re-fire it.
    expect(r.baseline.get("a")).toBe(true);
  });

  it("still notifies when focused but a different session is selected", () => {
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({
        prev,
        sessions: [row("a", "waiting")],
        windowFocused: true,
        selectedId: "b",
      }),
    );
    expect(r.notify.map((n) => n.sessionId)).toEqual(["a"]);
  });

  it("still notifies when the session is selected but the window is unfocused", () => {
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({
        prev,
        sessions: [row("a", "waiting")],
        windowFocused: false,
        selectedId: "a",
      }),
    );
    expect(r.notify.map((n) => n.sessionId)).toEqual(["a"]);
  });

  it("handles multiple sessions independently in one poll", () => {
    const prev = new Map([
      ["a", false], // transitions → notify
      ["b", true], // still waiting → no re-notify
      ["c", false], // stays working → nothing
    ]);
    const r = decideNotifications(
      input({
        prev,
        sessions: [
          row("a", "waiting"),
          row("b", "waiting"),
          row("c", "working"),
        ],
      }),
    );
    expect(r.notify.map((n) => n.sessionId)).toEqual(["a"]);
    expect(r.baseline).toEqual(
      new Map([
        ["a", true],
        ["b", true],
        ["c", false],
      ]),
    );
  });

  it("does not notify for a session with no baseline entry (just appeared)", () => {
    // A just-discovered session already waiting has no observed false before it — unknown history,
    // not a transition. It seeds true, so it also can't fire on the next poll while still waiting.
    const prev = new Map([["a", false]]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "working"), row("new", "waiting")] }),
    );
    expect(r.notify).toEqual([]);
    expect(r.baseline.get("new")).toBe(true);
  });

  it("setting off suppresses notifications but still advances the baseline", () => {
    const prev = new Map([["a", false]]);
    const off = decideNotifications(
      input({ prev, sessions: [row("a", "waiting")], enabled: false }),
    );
    expect(off.notify).toEqual([]);
    expect(off.baseline.get("a")).toBe(true);
    // Re-enabling on the next poll must not fire the transition that happened while off.
    const on = decideNotifications(
      input({ prev: off.baseline, sessions: [row("a", "waiting")] }),
    );
    expect(on.notify).toEqual([]);
  });

  it("treats non-waiting states (idle, ended) as not awaiting", () => {
    const prev = new Map([
      ["a", true],
      ["b", true],
    ]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "idle"), row("b", "ended")] }),
    );
    expect(r.notify).toEqual([]);
    expect(r.baseline.get("a")).toBe(false);
    expect(r.baseline.get("b")).toBe(false);
  });

  it("drops vanished sessions from the baseline", () => {
    const prev = new Map([
      ["gone", true],
      ["a", false],
    ]);
    const r = decideNotifications(
      input({ prev, sessions: [row("a", "working")] }),
    );
    expect(r.baseline.has("gone")).toBe(false);
    expect(r.baseline.size).toBe(1);
  });
});
