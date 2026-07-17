import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionPinStore } from "../src/main/session-pins";

describe("createSessionPinStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-session-pins-"));
    dirs.push(d);
    return d;
  }

  it("reads an empty map when the file is absent", () => {
    expect(createSessionPinStore({ dir: tmp() }).read()).toEqual({});
  });
  it("persists a pin stamp from the injected clock and reads it back", () => {
    const dir = tmp();
    createSessionPinStore({ dir, now: () => 1234 }).set("abc", true);
    expect(createSessionPinStore({ dir }).read()).toEqual({ abc: 1234 });
  });
  it("unpin deletes the key", () => {
    const dir = tmp();
    const store = createSessionPinStore({ dir, now: () => 1234 });
    store.set("abc", true);
    store.set("abc", false);
    expect(store.read()).toEqual({});
  });
  it("keeps other pins when one is cleared", () => {
    const dir = tmp();
    const store = createSessionPinStore({ dir, now: () => 7 });
    store.set("a", true);
    store.set("b", true);
    store.set("a", false);
    expect(store.read()).toEqual({ b: 7 });
  });
  it("re-pinning an already-pinned id refreshes its stamp", () => {
    const dir = tmp();
    let t = 100;
    const store = createSessionPinStore({ dir, now: () => t });
    store.set("abc", true);
    t = 200;
    store.set("abc", true);
    expect(store.read()).toEqual({ abc: 200 });
  });
  it("ignores non-number values in a hand-edited file", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "session-pins.json"),
      JSON.stringify({ a: 5, b: "12", c: null, d: { x: 1 } }),
    );
    expect(createSessionPinStore({ dir }).read()).toEqual({ a: 5 });
  });
  it("tolerates a corrupt file by reading an empty map", () => {
    const dir = tmp();
    writeFileSync(join(dir, "session-pins.json"), "{ not json");
    expect(createSessionPinStore({ dir }).read()).toEqual({});
  });
  it("tolerates a non-object JSON file by reading an empty map", () => {
    const dir = tmp();
    writeFileSync(join(dir, "session-pins.json"), JSON.stringify([1, 2]));
    expect(createSessionPinStore({ dir }).read()).toEqual({});
  });
});
