// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  usePolledRead,
  type Read,
} from "../../src/renderer/src/workspace/use-polled-read";

// React only routes updates through act's queue when this flag is set (jsdom has no real renderer
// environment to signal it).
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** One committed frame: the id the probe rendered with, and the value the hook returned for it. */
interface Commit {
  id: string;
  value: string | null | undefined;
}

/** Renders the hook and logs every COMMITTED (id, value) pair via useLayoutEffect — layout effects
 *  run synchronously at commit, before the browser could paint and before passive effects, so the
 *  log is exactly the sequence of frames a user could see. */
function Probe({
  id,
  read,
  log,
}: {
  id: string;
  read: (id: string, since?: number) => Promise<Read<string>>;
  log: Commit[];
}) {
  const value = usePolledRead(id, read);
  useLayoutEffect(() => {
    log.push({ id, value });
  });
  return null;
}

/** A read that resolves immediately with a per-id payload, so cross-id leakage is observable. */
const readById = (id: string): Promise<Read<string>> =>
  Promise.resolve({ status: "changed", mtimeMs: 1, data: `data-${id}` });

function mount(log: Commit[], id: string) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (nextId: string) =>
    act(async () => {
      root.render(createElement(Probe, { id: nextId, read: readById, log }));
      // Yield a microtask inside act so the poll fired by the commit's effect settles before act
      // flushes the resulting update.
      await Promise.resolve();
    });
  return {
    render,
    unmount: () => {
      act(() => root.unmount());
    },
    first: render(id),
  };
}

describe("usePolledRead", () => {
  it("starts undefined, then lands the first poll's value", async () => {
    const log: Commit[] = [];
    const { first, unmount } = mount(log, "a");
    await first;
    expect(log[0]).toEqual({ id: "a", value: undefined });
    expect(log.at(-1)).toEqual({ id: "a", value: "data-a" });
    unmount();
  });

  it("never commits the previous session's value under a new session id", async () => {
    const log: Commit[] = [];
    const { first, render, unmount } = mount(log, "a");
    await first;
    expect(log.at(-1)).toEqual({ id: "a", value: "data-a" });

    log.length = 0;
    await render("b");
    // The switch must never paint a frame pairing the NEW id with the OLD session's data — that is
    // the cross-session Throughput flash (codex session briefly wearing the Claude session's numbers).
    expect(log).not.toContainEqual({ id: "b", value: "data-a" });
    // And it must pass through the reset (undefined = loading) before the new session's data lands.
    expect(log[0]).toEqual({ id: "b", value: undefined });
    expect(log.at(-1)).toEqual({ id: "b", value: "data-b" });
    unmount();
  });
});
