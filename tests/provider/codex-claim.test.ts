import { describe, it, expect } from "vitest";
import {
  detectClaims,
  applyClaims,
  scanClaimableRollouts,
  type ClaimableRollout,
} from "../../src/main/provider/codex/claim";
import type { ManagedCodexPty } from "../../src/main/managed-registry";
import type { RolloutFile } from "../../src/main/provider/codex/rollout";

/** The in-process scan wired the way the composition root's fallback wires it. */
const inProcessScan =
  (listRollouts: () => RolloutFile[], readHead: (p: string) => { cwd: string } | null) =>
  (earliestMs: number, claimedRollouts: ReadonlySet<string>) =>
    scanClaimableRollouts({ listRollouts, readHead, earliestMs, claimedRollouts });

const pty = (o: Partial<ManagedCodexPty> = {}): ManagedCodexPty => ({
  id: "draft-1",
  cwd: "/w",
  spawnedAtMs: 10_000,
  ...o,
});
const roll = (o: Partial<ClaimableRollout> = {}): ClaimableRollout => ({
  path: "/x/r1.jsonl",
  id: "r1",
  timestampMs: 11_000,
  cwd: "/w",
  ...o,
});

describe("detectClaims", () => {
  it("claims the closest same-cwd rollout at/after the spawn time", () => {
    const claims = detectClaims(
      [pty()],
      [roll({ id: "late", path: "/x/late", timestampMs: 20_000 }), roll()],
      new Set(),
    );
    expect(claims).toEqual([
      { from: "draft-1", to: "r1", rolloutPath: "/x/r1.jsonl" },
    ]);
  });
  it("tolerates small clock skew (CLAIM_SLACK_MS) but not an older rollout", () => {
    expect(
      detectClaims([pty()], [roll({ timestampMs: 9_000 })], new Set()),
    ).toHaveLength(1); // 1s early < 2s slack → claimable
    expect(
      detectClaims([pty()], [roll({ timestampMs: 1_000 })], new Set()),
    ).toHaveLength(0);
  });
  it("never claims a different cwd, an already-claimed path, or double-claims one rollout", () => {
    expect(
      detectClaims([pty()], [roll({ cwd: "/other" })], new Set()),
    ).toHaveLength(0);
    expect(
      detectClaims([pty()], [roll()], new Set(["/x/r1.jsonl"])),
    ).toHaveLength(0);
    const two = detectClaims(
      [
        pty({ id: "a", spawnedAtMs: 10_000 }),
        pty({ id: "b", spawnedAtMs: 10_500 }),
      ],
      [roll()],
      new Set(),
    );
    expect(two).toHaveLength(1); // one rollout can satisfy only one pty
  });
  it("skips ptys that already claimed, and rollouts whose id equals the pty id (already renamed)", () => {
    expect(
      detectClaims([pty({ claimedRollout: "/x/r0" })], [roll()], new Set()),
    ).toHaveLength(0);
    expect(detectClaims([pty({ id: "r1" })], [roll()], new Set())).toHaveLength(
      0,
    );
  });
});

describe("applyClaims", () => {
  it("head-reads only plausible candidates and fires apply per claim", async () => {
    const applied: unknown[] = [];
    const reads: string[] = [];
    const claims = await applyClaims({
      ptys: [pty()],
      claimedRollouts: new Set(),
      scan: inProcessScan(
        () => [
          { path: "/x/old.jsonl", id: "old", timestampMs: 1_000, mtimeMs: 1 },
          { path: "/x/r1.jsonl", id: "r1", timestampMs: 11_000, mtimeMs: 2 },
        ],
        (p) => {
          reads.push(p);
          return { cwd: "/w" };
        },
      ),
      apply: (c) => applied.push(c),
    });
    expect(reads).toEqual(["/x/r1.jsonl"]); // the too-old rollout is filtered before any read
    expect(claims).toHaveLength(1);
    expect(applied).toEqual(claims);
  });
  it("does nothing (and scans nothing) when no unclaimed codex pty exists", async () => {
    let scanned = false;
    const claims = await applyClaims({
      ptys: [],
      claimedRollouts: new Set(),
      scan: () => {
        scanned = true;
        return [];
      },
      apply: () => {},
    });
    expect(claims).toEqual([]);
    expect(scanned).toBe(false);
  });
  it("accepts an async scan — the parse-worker routing the reconcile uses", async () => {
    const applied: unknown[] = [];
    const claims = await applyClaims({
      ptys: [pty()],
      claimedRollouts: new Set(),
      scan: () => Promise.resolve([roll()]),
      apply: (c) => applied.push(c),
    });
    expect(claims).toEqual([
      { from: "draft-1", to: "r1", rolloutPath: "/x/r1.jsonl" },
    ]);
    expect(applied).toEqual(claims);
  });
});

describe("resume pty claim-binding invariant", () => {
  // A codex Resume registers its pty ALREADY claim-bound (managed-registry `add`'s claimedRollout).
  // These lock the two properties binding buys. An unbound resume pty of an OLD rollout would be
  // pending forever — its own rollout never enters the recent candidate window, so detectClaims'
  // "already renamed" skip can't see it — and could mis-claim a fresh same-cwd rollout.
  it("a claim-bound resume pty never matches a fresh same-cwd rollout", () => {
    const resumed = pty({
      id: "old-rollout-id",
      spawnedAtMs: 10_000,
      claimedRollout: "/x/old.jsonl",
    });
    expect(
      detectClaims([resumed], [roll()], new Set(["/x/old.jsonl"])),
    ).toEqual([]);
  });
  it("applyClaims stays lazy when every codex pty is claim-bound", async () => {
    let scanned = false;
    await applyClaims({
      ptys: [pty({ claimedRollout: "/x/old.jsonl" })],
      claimedRollouts: new Set(["/x/old.jsonl"]),
      scan: () => {
        scanned = true;
        return [];
      },
      apply: () => {
        throw new Error("nothing should claim");
      },
    });
    expect(scanned).toBe(false);
  });
});
