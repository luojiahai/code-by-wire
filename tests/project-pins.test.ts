import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectPinStore } from "../src/main/project-pins";

describe("createProjectPinStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), "cbw-project-pins-"));
    dirs.push(dir);
    return dir;
  }

  it("reads an empty map when the file is absent", () => {
    expect(createProjectPinStore({ dir: tmp() }).read()).toEqual({});
  });

  it("persists, refreshes, and removes a project pin", () => {
    const dir = tmp();
    let now = 10;
    const store = createProjectPinStore({ dir, now: () => now });
    store.set("/repo", true);
    now = 20;
    store.set("/repo", true);
    expect(createProjectPinStore({ dir }).read()).toEqual({ "/repo": 20 });
    store.set("/repo", false);
    expect(store.read()).toEqual({});
  });

  it("keeps other project pins when one is removed", () => {
    const store = createProjectPinStore({ dir: tmp(), now: () => 7 });
    store.set("/repo-a", true);
    store.set("/repo-b", true);
    store.set("/repo-a", false);
    expect(store.read()).toEqual({ "/repo-b": 7 });
  });

  it("keeps only non-empty keys with finite numeric stamps", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "project-pins.json"),
      '{"/ok":5,"":7,"string":"8","null":null,"infinite":1e999}',
    );
    expect(createProjectPinStore({ dir }).read()).toEqual({ "/ok": 5 });
  });

  it("tolerates corrupt JSON by reading an empty map", () => {
    const dir = tmp();
    writeFileSync(join(dir, "project-pins.json"), "{ not json");
    expect(createProjectPinStore({ dir }).read()).toEqual({});
  });

  it.each([null, [1, 2], "pins", 3])(
    "tolerates wrong-shape JSON %j by reading an empty map",
    (value) => {
      const dir = tmp();
      writeFileSync(join(dir, "project-pins.json"), JSON.stringify(value));
      expect(createProjectPinStore({ dir }).read()).toEqual({});
    },
  );
});
