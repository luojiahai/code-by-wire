import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUsageService, USAGE_TTL_MS } from "../../src/main/usage/fetch";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const BODY = {
  seven_day: { utilization: 22, resets_at: "2026-07-14T00:00:00Z" },
};

function okResponse(body: unknown = BODY): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("createUsageService", () => {
  let dir: string;
  let clock: number;
  const now = (): number => clock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cbw-usage-"));
    clock = 1_760_000_000_000;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function service(over: {
    fetchFn?: typeof fetch;
    readToken?: () => Promise<string | null>;
    cachePath?: string;
  }) {
    return createUsageService({
      fetchFn: over.fetchFn ?? (() => Promise.resolve(okResponse())),
      readToken: over.readToken ?? (() => Promise.resolve("tok-1")),
      cachePath: over.cachePath ?? join(dir, "usage-cache.json"),
      now,
    });
  }

  it("first read returns null and spawns a refresh; next read serves the data", async () => {
    let calls = 0;
    const svc = service({
      fetchFn: () => (calls++, Promise.resolve(okResponse())),
    });
    expect(svc.read()).toBeNull();
    await flush();
    expect(svc.read()?.sevenDay?.usedPct).toBe(22);
    expect(calls).toBe(1);
  });

  it("TTL: no second network call within 180 s; a stale read refetches", async () => {
    let calls = 0;
    const svc = service({
      fetchFn: () => (calls++, Promise.resolve(okResponse())),
    });
    svc.read();
    await flush();
    clock += USAGE_TTL_MS - 1;
    svc.read();
    await flush();
    expect(calls).toBe(1);
    clock += 2; // now past the TTL
    svc.read(); // stale data returned immediately, refresh spawned
    await flush();
    expect(calls).toBe(2);
  });

  it("single-flight: concurrent stale reads spawn one refresh", async () => {
    let calls = 0;
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    const svc = service({ fetchFn: () => (calls++, gate) });
    svc.read();
    svc.read();
    svc.read();
    release(okResponse());
    await flush();
    expect(calls).toBe(1);
    expect(svc.read()?.sevenDay?.usedPct).toBe(22);
  });

  it("stale data is returned while a refresh is in flight", async () => {
    let first = true;
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((r) => (release = r));
    const svc = service({
      fetchFn: () =>
        first ? ((first = false), Promise.resolve(okResponse())) : gate,
    });
    svc.read();
    await flush();
    clock += USAGE_TTL_MS + 1;
    expect(svc.read()?.sevenDay?.usedPct).toBe(22); // stale, in-flight
    release(
      okResponse({
        seven_day: { utilization: 25, resets_at: "2026-07-14T00:00:00Z" },
      }),
    );
    await flush();
    expect(svc.read()?.sevenDay?.usedPct).toBe(25);
  });

  it("429 honors the Retry-After header", async () => {
    let calls = 0;
    const svc = service({
      fetchFn: () => (
        calls++,
        Promise.resolve(
          new Response("", { status: 429, headers: { "retry-after": "60" } }),
        )
      ),
    });
    svc.read();
    await flush();
    clock += 59_000;
    svc.read();
    await flush();
    expect(calls).toBe(1); // still backed off
    clock += 2_000;
    svc.read();
    await flush();
    expect(calls).toBe(2); // backoff elapsed
  });

  it("failures back off 30 s and keep the last good data", async () => {
    let fail = false;
    let calls = 0;
    const svc = service({
      fetchFn: () => {
        calls++;
        return fail
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(okResponse());
      },
    });
    svc.read();
    await flush();
    fail = true;
    clock += USAGE_TTL_MS + 1;
    svc.read();
    await flush();
    expect(svc.read()?.sevenDay?.usedPct).toBe(22); // stale beats blank
    const after = calls;
    clock += 29_000;
    svc.read();
    await flush();
    expect(calls).toBe(after); // 30 s error backoff suppresses refetch
  });

  it("no token → null result + backoff; token is read fresh per fetch", async () => {
    let tokenReads = 0;
    const svc = service({
      readToken: () => (tokenReads++, Promise.resolve(null)),
    });
    svc.read();
    await flush();
    expect(svc.read()).toBeNull();
    expect(tokenReads).toBe(1);
    clock += 31_000;
    svc.read();
    await flush();
    expect(tokenReads).toBe(2);
  });

  it("fingerprint mismatch (account switch) drops cached data before fetching", async () => {
    const path = join(dir, "usage-cache.json");
    const first = service({ cachePath: path });
    first.read();
    await flush();
    expect(readFileSync(path, "utf8")).toContain("tokenHash");
    // Same cache file, DIFFERENT token, and the new account's fetch fails: the old numbers must not show.
    const second = createUsageService({
      fetchFn: () => Promise.reject(new Error("down")),
      readToken: () => Promise.resolve("other-token"),
      cachePath: path,
      now,
    });
    // The fingerprint gate lives on the refresh path only — a FRESH cache is served without any token
    // comparison (parity with ccstatusline usage-fetch.ts:593; spec §1.1 "Data fresh → return it").
    // So the account switch is caught once the cache goes stale and a refresh runs.
    clock += USAGE_TTL_MS + 1;
    expect(second.read()?.sevenDay?.usedPct).toBe(22); // stale persisted data, returned pre-validation
    await flush();
    expect(second.read()).toBeNull(); // dropped on fingerprint mismatch during the refresh
  });

  it("cache file round-trip: a new service serves persisted data without the network", async () => {
    const path = join(dir, "usage-cache.json");
    const first = service({ cachePath: path });
    first.read();
    await flush();
    let calls = 0;
    const second = createUsageService({
      fetchFn: () => (calls++, Promise.resolve(okResponse())),
      readToken: () => Promise.resolve("tok-1"),
      cachePath: path,
      now,
    });
    expect(second.read()?.sevenDay?.usedPct).toBe(22);
    await flush();
    expect(calls).toBe(0); // still within the persisted TTL
  });

  it("corrupt or absent cache file is tolerated", async () => {
    const path = join(dir, "usage-cache.json");
    writeFileSync(path, "{corrupt");
    const svc = service({ cachePath: path });
    expect(svc.read()).toBeNull();
    await flush();
    expect(svc.read()?.sevenDay?.usedPct).toBe(22);
  });
});
