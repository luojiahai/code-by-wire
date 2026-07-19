import { describe, expect, it } from "vitest";
import { createTtlFetch } from "../../src/main/util/ttl-fetch";

/** A manually-resolved fetch stub so tests control exactly when the refresh settles. */
function deferredFetch<T>() {
  const calls: Array<{
    resolve: (v: T | null) => void;
    reject: (e: Error) => void;
  }> = [];
  const fetch = (): Promise<T | null> =>
    new Promise<T | null>((resolve, reject) => calls.push({ resolve, reject }));
  return { fetch, calls };
}

/** Drain microtasks plus one macrotask so a background refresh's whole await chain settles —
 *  robust against the exact number of awaits inside the refresh, unlike counted Promise.resolve()s. */
const settled = (): Promise<void> => new Promise((r) => setImmediate(r));

describe("createTtlFetch", () => {
  it("returns null before the first success and spawns exactly one refresh", async () => {
    const d = deferredFetch<string>();
    const t = 1_000;
    const svc = createTtlFetch({
      fetch: d.fetch,
      successTtlMs: 60_000,
      failureTtlMs: 300_000,
      now: () => t,
    });
    expect(svc.read()).toBeNull();
    expect(svc.read()).toBeNull(); // second stale read must NOT spawn a second fetch
    expect(d.calls.length).toBe(1);
    d.calls[0].resolve("v1");
    await settled();
    expect(svc.read()).toBe("v1");
  });

  it("serves cached data inside the success TTL without refetching", async () => {
    const d = deferredFetch<string>();
    let t = 1_000;
    const svc = createTtlFetch({
      fetch: d.fetch,
      successTtlMs: 60_000,
      failureTtlMs: 300_000,
      now: () => t,
    });
    svc.read();
    d.calls[0].resolve("v1");
    await settled();
    t += 59_999;
    expect(svc.read()).toBe("v1");
    expect(d.calls.length).toBe(1);
    t += 2; // past the success TTL
    expect(svc.read()).toBe("v1"); // stale value still served while the refresh runs
    expect(d.calls.length).toBe(2);
  });

  it("keeps the last good value on failure and backs off by the failure TTL", async () => {
    const d = deferredFetch<string>();
    let t = 1_000;
    const svc = createTtlFetch({
      fetch: d.fetch,
      successTtlMs: 60_000,
      failureTtlMs: 300_000,
      now: () => t,
    });
    svc.read();
    d.calls[0].resolve("v1");
    await settled();
    t += 60_001;
    svc.read(); // spawns refresh #2
    d.calls[1].resolve(null); // failure
    await settled();
    expect(svc.read()).toBe("v1"); // last good kept
    expect(d.calls.length).toBe(2); // inside the failure backoff — no new fetch
    t += 300_001;
    svc.read();
    expect(d.calls.length).toBe(3); // backoff elapsed — refetches
  });

  it("treats a throwing fetch as failure, never rejecting out of read()", async () => {
    const d = deferredFetch<string>();
    const t = 1_000;
    const svc = createTtlFetch({
      fetch: d.fetch,
      successTtlMs: 60_000,
      failureTtlMs: 300_000,
      now: () => t,
    });
    svc.read();
    d.calls[0].reject(new Error("network down"));
    await settled();
    expect(svc.read()).toBeNull();
    expect(d.calls.length).toBe(1); // inside failure backoff
  });
});
