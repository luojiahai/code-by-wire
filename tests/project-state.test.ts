import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectStateStore } from "../src/main/project-state";

describe("createProjectStateStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });
  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), "cbw-project-state-"));
    dirs.push(dir);
    return dir;
  }

  it("uses project-state.json and makes pin/hide mutually exclusive", () => {
    const dir = tmp();
    let now = 10;
    const store = createProjectStateStore({ dir, now: () => now });
    store.setPlacement("/repo", "pinned");
    now = 20;
    store.setPlacement("/repo", "hidden");
    expect(store.read()).toEqual({ "/repo": { hiddenAtMs: 20 } });
    now = 30;
    store.setPlacement("/repo", "pinned");
    expect(store.read()).toEqual({ "/repo": { pinnedAtMs: 30 } });
    expect(readFileSync(join(dir, "project-state.json"), "utf8")).toContain(
      "pinnedAtMs",
    );
  });

  it("ordinary removes the entry", () => {
    const store = createProjectStateStore({ dir: tmp(), now: () => 7 });
    store.setPlacement("/a", "hidden");
    store.setPlacement("/b", "pinned");
    store.setPlacement("/a", "ordinary");
    expect(store.read()).toEqual({ "/b": { pinnedAtMs: 7 } });
  });

  it("keeps only valid entries and fields", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "project-state.json"),
      JSON.stringify({
        "/pin": { pinnedAtMs: 5, junk: 1 },
        "/hide": { hiddenAtMs: 6 },
        "/both": { pinnedAtMs: 7, hiddenAtMs: 8 },
        "/bad": { pinnedAtMs: "9" },
        "": { pinnedAtMs: 1 },
      }),
    );
    expect(createProjectStateStore({ dir }).read()).toEqual({
      "/pin": { pinnedAtMs: 5 },
      "/hide": { hiddenAtMs: 6 },
    });
  });

  it.each(["{bad", "null", "[]", "3"])(
    "returns empty for invalid JSON shape %s",
    (raw) => {
      const dir = tmp();
      writeFileSync(join(dir, "project-state.json"), raw);
      expect(createProjectStateStore({ dir }).read()).toEqual({});
    },
  );
});
