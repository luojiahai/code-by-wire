import { describe, it, expect } from "vitest";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  indexRollouts,
  isRolloutLive,
  listCodexCandidates,
  readIndexTitles,
  DEFAULT_LIVE_WINDOW_MS,
} from "../../src/main/provider/codex/discover";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-codex-");

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * DAY_MS;

/** Write a rollout under its dated dir and pin its mtime (seconds precision, like utimes). */
function writeRollout(
  home: string,
  day: string, // "YYYY/MM/DD"
  uuid: string,
  mtimeMs: number,
  content = "",
): string {
  const dir = join(home, "sessions", day);
  mkdirSync(dir, { recursive: true });
  const path = join(
    dir,
    `rollout-${day.replaceAll("/", "-")}T00-00-00-${uuid}.jsonl`,
  );
  writeFileSync(path, content);
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
  return path;
}

/** The "YYYY/MM/DD" UTC day-dir name for an epoch ms. */
function dayDirOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replaceAll("-", "/");
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("codex discovery", () => {
  it("contributes zero sessions (and zero errors) when ~/.codex doesn't exist", () => {
    const home = join(makeHome(), "does-not-exist");
    expect(
      listCodexCandidates({
        codexDir: home,
        now: Date.now(),
        recentWindowMs: WINDOW_MS,
        liveWindowMs: DEFAULT_LIVE_WINDOW_MS,
      }),
    ).toEqual([]);
  });

  it("skips whole day directories older than the window by name, without reading them", () => {
    const home = makeHome();
    const now = Date.now();
    writeRollout(home, dayDirOf(now), A, now - 1000);
    // An ancient day dir whose file has a FRESH mtime: the name-based prefilter must still skip it,
    // proving the walk is bounded by the date tree, not by statting everything.
    writeRollout(home, "2020/01/01", B, now - 1000);

    const ids = [...indexRollouts(home, now, WINDOW_MS).keys()];
    expect(ids).toEqual([A]);
  });

  it("cuts by mtime inside a recent day dir (a file that aged out of the window)", () => {
    const home = makeHome();
    const now = Date.now();
    const day = dayDirOf(now);
    writeRollout(home, day, A, now - 1000);
    writeRollout(home, day, B, now - WINDOW_MS - DAY_MS); // recent dir, stale file

    const ids = [...indexRollouts(home, now, WINDOW_MS).keys()];
    expect(ids).toEqual([A]);
  });

  it("keeps the freshest path when an id appears twice", () => {
    const home = makeHome();
    const now = Date.now();
    writeRollout(home, dayDirOf(now - DAY_MS), A, now - DAY_MS);
    const fresh = writeRollout(home, dayDirOf(now), A, now - 1000);

    const hit = indexRollouts(home, now, WINDOW_MS).get(A);
    expect(hit?.path).toBe(fresh);
  });

  it("derives liveness from mtime freshness (the observe-only heuristic)", () => {
    const now = Date.now();
    expect(isRolloutLive(now - 5_000, now)).toBe(true);
    expect(isRolloutLive(now - DEFAULT_LIVE_WINDOW_MS - 1, now)).toBe(false);

    const home = makeHome();
    writeRollout(home, dayDirOf(now), A, now - 5_000);
    writeRollout(home, dayDirOf(now), C, now - 10 * 60_000);
    const byId = new Map(
      listCodexCandidates({
        codexDir: home,
        now,
        recentWindowMs: WINDOW_MS,
        liveWindowMs: DEFAULT_LIVE_WINDOW_MS,
      }).map((c) => [c.id, c]),
    );
    expect(byId.get(A)?.alive).toBe(true);
    expect(byId.get(C)?.alive).toBe(false);
    expect(byId.get(C)?.transcriptPath).toContain(C);
  });

  it("reads titles from session_index.jsonl, tolerating malformed lines", () => {
    const home = makeHome();
    writeFileSync(
      join(home, "session_index.jsonl"),
      `{"id":"${A}","thread_name":"First name","updated_at":"2026-07-01T00:00:00Z"}\n` +
        `not json at all\n` +
        `{"id":"${A}","thread_name":"Renamed thread","updated_at":"2026-07-02T00:00:00Z"}\n`,
    );
    const titles = readIndexTitles(home);
    expect(titles.get(A)).toBe("Renamed thread"); // later entries overwrite earlier ones
  });

  it("tail-reads a large index: entries beyond the tail budget are simply absent", () => {
    const home = makeHome();
    const early = `{"id":"${B}","thread_name":"Buried early entry","padding":"${"x".repeat(600)}"}\n`;
    const late = `{"id":"${A}","thread_name":"Recent entry"}\n`;
    writeFileSync(join(home, "session_index.jsonl"), early + late);

    const titles = readIndexTitles(home, 128); // budget smaller than the file forces the tail path
    expect(titles.get(A)).toBe("Recent entry");
    expect(titles.has(B)).toBe(false);
  });

  it("returns no titles when session_index.jsonl is missing", () => {
    expect(readIndexTitles(makeHome()).size).toBe(0);
  });
});
