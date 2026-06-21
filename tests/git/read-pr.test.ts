import { describe, it, expect, beforeEach } from "vitest";
import {
  readPr,
  _setPrRunner,
  _resetPrCache,
} from "../../src/main/git/read-pr";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  _resetPrCache();
});

describe("readPr", () => {
  it("returns null for a missing cwd or branch", () => {
    expect(readPr("", "main")).toBeNull();
    expect(readPr("/repo", null)).toBeNull();
  });

  it("fetches once, then serves the parsed PR from cache within the TTL", async () => {
    let calls = 0;
    _setPrRunner(() => {
      calls++;
      return Promise.resolve(
        JSON.stringify({
          number: 166,
          url: "https://github.com/o/r/pull/166",
        }),
      );
    });
    const clock = 1000;
    const now = (): number => clock;

    expect(readPr("/repo", "main", now)).toBeNull(); // cold: kicks the fetch
    await flush();
    expect(calls).toBe(1);

    expect(readPr("/repo", "main", now)).toEqual({
      number: 166,
      url: "https://github.com/o/r/pull/166",
    });
    expect(calls).toBe(1); // fresh: no new fetch
  });

  it("refreshes after the TTL, serving the stale value meanwhile", async () => {
    let calls = 0;
    _setPrRunner(() => {
      calls++;
      return Promise.resolve(JSON.stringify({ number: calls, url: "u" }));
    });
    let clock = 1000;
    const now = (): number => clock;

    expect(readPr("/repo", "main", now)).toBeNull();
    await flush();
    expect(readPr("/repo", "main", now)).toEqual({ number: 1, url: "u" });

    clock += 60_001; // past the 60s TTL
    expect(readPr("/repo", "main", now)).toEqual({ number: 1, url: "u" }); // stale value served
    await flush();
    expect(calls).toBe(2);
    expect(readPr("/repo", "main", now)).toEqual({ number: 2, url: "u" });
  });

  it("caches null when gh fails or there is no PR", async () => {
    _setPrRunner(() => Promise.resolve(null));
    expect(readPr("/repo", "main")).toBeNull();
    await flush();
    expect(readPr("/repo", "main")).toBeNull();
  });

  it("single-flights concurrent reads", async () => {
    let calls = 0;
    let resolve!: (s: string | null) => void;
    _setPrRunner(
      () =>
        new Promise<string | null>((r) => {
          calls++;
          resolve = r;
        }),
    );
    expect(readPr("/repo", "main")).toBeNull(); // kicks fetch #1
    expect(readPr("/repo", "main")).toBeNull(); // still fetching → no fetch #2
    expect(calls).toBe(1);
    resolve(JSON.stringify({ number: 7, url: "u" }));
    await flush();
    expect(readPr("/repo", "main")).toEqual({ number: 7, url: "u" });
  });

  it("nulls a previously-cached PR when a later refresh rejects", async () => {
    let clock = 1000;
    const now = (): number => clock;
    _setPrRunner(() =>
      Promise.resolve(JSON.stringify({ number: 1, url: "u" })),
    );
    expect(readPr("/repo", "main", now)).toBeNull();
    await flush();
    expect(readPr("/repo", "main", now)).toEqual({ number: 1, url: "u" });

    _setPrRunner(() => Promise.reject(new Error("gh blew up")));
    clock += 60_001; // past the TTL → next read kicks a refresh that rejects
    expect(readPr("/repo", "main", now)).toEqual({ number: 1, url: "u" }); // stale served meanwhile
    await flush();
    expect(readPr("/repo", "main", now)).toBeNull(); // rejection cached null
  });
});
