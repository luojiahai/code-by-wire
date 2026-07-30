import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProjectStateStore,
  remapPlacements,
} from "../src/main/project-state";

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

  it("writes a whole state in one pass", () => {
    const dir = tmp();
    const store = createProjectStateStore({ dir, now: () => 1 });
    store.write({ "/repo": { pinnedAtMs: 5 }, "/other": { hiddenAtMs: 6 } });
    expect(createProjectStateStore({ dir }).read()).toEqual({
      "/repo": { pinnedAtMs: 5 },
      "/other": { hiddenAtMs: 6 },
    });
  });
});

describe("remapPlacements", () => {
  it("moves an entry keyed on a subdirectory to its repo root", () => {
    expect(
      remapPlacements(
        { "/w/repo/src": { pinnedAtMs: 5 } },
        new Map([["/w/repo/src", "/w/repo"]]),
      ),
    ).toEqual({ "/w/repo": { pinnedAtMs: 5 } });
  });

  it("keeps the newer entry when a subdirectory and its repo root collide", () => {
    expect(
      remapPlacements(
        { "/w/repo/src": { pinnedAtMs: 9 }, "/w/repo": { hiddenAtMs: 4 } },
        new Map([
          ["/w/repo/src", "/w/repo"],
          ["/w/repo", "/w/repo"],
        ]),
      ),
    ).toEqual({ "/w/repo": { pinnedAtMs: 9 } });

    expect(
      remapPlacements(
        { "/w/repo/src": { pinnedAtMs: 1 }, "/w/repo": { hiddenAtMs: 4 } },
        new Map([["/w/repo/src", "/w/repo"]]),
      ),
    ).toEqual({ "/w/repo": { hiddenAtMs: 4 } });
  });

  it("resolves two colliding subdirectories to the newest entry", () => {
    expect(
      remapPlacements(
        { "/w/repo/a": { hiddenAtMs: 2 }, "/w/repo/b": { pinnedAtMs: 8 } },
        new Map([
          ["/w/repo/a", "/w/repo"],
          ["/w/repo/b", "/w/repo"],
        ]),
      ),
    ).toEqual({ "/w/repo": { pinnedAtMs: 8 } });
  });

  it("leaves entries with no live session untouched", () => {
    expect(
      remapPlacements(
        { "/gone": { pinnedAtMs: 3 }, "/w/repo/src": { hiddenAtMs: 4 } },
        new Map([["/w/repo/src", "/w/repo"]]),
      ),
    ).toEqual({ "/gone": { pinnedAtMs: 3 }, "/w/repo": { hiddenAtMs: 4 } });
  });

  it("returns null when nothing moves, so a second launch writes nothing", () => {
    expect(
      remapPlacements(
        { "/w/repo": { pinnedAtMs: 5 } },
        new Map([
          ["/w/repo/src", "/w/repo"],
          ["/w/repo", "/w/repo"],
        ]),
      ),
    ).toBeNull();
    expect(
      remapPlacements({}, new Map([["/w/repo/src", "/w/repo"]])),
    ).toBeNull();
  });
});
