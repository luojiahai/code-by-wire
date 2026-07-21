import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLaunchArgsStore } from "../src/main/launch-args";

describe("createLaunchArgsStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-launch-args-"));
    dirs.push(d);
    return d;
  }

  it("reads null when the file is absent", () => {
    expect(createLaunchArgsStore({ dir: tmp() }).get("abc")).toBeNull();
  });
  it("persists an args string and reads it back across instances", () => {
    const dir = tmp();
    createLaunchArgsStore({ dir }).set("abc", "--dangerously-skip-permissions");
    expect(createLaunchArgsStore({ dir }).get("abc")).toBe(
      "--dangerously-skip-permissions",
    );
  });
  it("trims on set and clears the entry when the trimmed value is empty", () => {
    const dir = tmp();
    const store = createLaunchArgsStore({ dir });
    store.set("abc", "  --verbose  ");
    expect(store.get("abc")).toBe("--verbose");
    store.set("abc", "   ");
    expect(store.get("abc")).toBeNull();
  });
  it("rename moves the entry; no-op on missing source or occupied target", () => {
    const dir = tmp();
    const store = createLaunchArgsStore({ dir });
    store.set("a", "--x");
    store.rename("a", "b");
    expect(store.get("a")).toBeNull();
    expect(store.get("b")).toBe("--x");
    store.set("c", "--y");
    store.rename("b", "c"); // target occupied → no-op
    expect(store.get("b")).toBe("--x");
    expect(store.get("c")).toBe("--y");
    store.rename("zzz", "d"); // missing source → no-op
    expect(store.get("d")).toBeNull();
  });
  it("ignores non-string values in a hand-edited file", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "launch-args.json"),
      JSON.stringify({ a: "--ok", b: 5, c: null, d: ["x"] }),
    );
    const store = createLaunchArgsStore({ dir });
    expect(store.get("a")).toBe("--ok");
    expect(store.get("b")).toBeNull();
  });
  it("tolerates a corrupt file by reading empty", () => {
    const dir = tmp();
    writeFileSync(join(dir, "launch-args.json"), "{ not json");
    expect(createLaunchArgsStore({ dir }).get("a")).toBeNull();
  });
});
