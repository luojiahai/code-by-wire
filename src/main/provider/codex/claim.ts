import type { ManagedCodexPty } from "../../managed-registry";
import type { RolloutFile } from "./rollout";

/** Filename timestamps are whole seconds and pty spawn times come from a different clock read —
 *  allow a rollout stamped slightly BEFORE the recorded spawn to still match. */
export const CLAIM_SLACK_MS = 2_000;

/** A rollout with its head-read cwd — the pure matcher's input. */
export interface ClaimableRollout {
  path: string;
  id: string;
  timestampMs: number;
  cwd: string;
}

/** One resolved correlation: re-key the live row `from` (app-minted draft id) to `to` (codex's own
 *  session id) and bind `rolloutPath` so discovery stops offering it as a separate row. */
export interface Claim {
  from: string;
  to: string;
  rolloutPath: string;
}

/**
 * Match unclaimed live codex ptys to unclaimed rollouts: same cwd, filename timestamp at/after the
 * spawn (minus CLAIM_SLACK_MS), closest timestamp wins, each rollout claimed at most once. Pure —
 * mirrors detectRotations' shape so it unit-tests without any fs. A pty whose id already equals a
 * rollout id has been renamed by a previous pass and is skipped.
 */
export function detectClaims(
  ptys: ManagedCodexPty[],
  rollouts: ClaimableRollout[],
  claimed: ReadonlySet<string>,
): Claim[] {
  const taken = new Set(claimed);
  const out: Claim[] = [];
  // Older spawns match first, so near-simultaneous same-cwd spawns pair with rollouts in order.
  const pending = ptys
    .filter((p) => p.claimedRollout === undefined)
    .sort((a, b) => a.spawnedAtMs - b.spawnedAtMs);
  for (const pty of pending) {
    if (rollouts.some((r) => r.id === pty.id)) continue; // already renamed to its rollout id
    let best: ClaimableRollout | null = null;
    for (const r of rollouts) {
      if (taken.has(r.path)) continue;
      if (r.cwd !== pty.cwd) continue;
      if (r.timestampMs < pty.spawnedAtMs - CLAIM_SLACK_MS) continue;
      if (best === null || r.timestampMs < best.timestampMs) best = r;
    }
    if (best) {
      taken.add(best.path);
      out.push({ from: pty.id, to: best.id, rolloutPath: best.path });
    }
  }
  return out;
}

/**
 * The impure wrapper the beforeSync reconcile calls (the same slot as claude's applyRotations, so
 * a claim's relabel + re-key land in the pass that first discovers the rollout — no duplicate-row
 * window). Lazy: with no unclaimed codex pty nothing can claim, so the rollout walk is skipped
 * entirely. Head-reads run only on rollouts that pass the cheap filename-time filter.
 */
export function applyClaims(deps: {
  ptys: ManagedCodexPty[];
  claimedRollouts: ReadonlySet<string>;
  listRollouts: () => RolloutFile[];
  readHead: (path: string) => { cwd: string } | null;
  apply: (claim: Claim) => void;
}): Claim[] {
  const pending = deps.ptys.filter((p) => p.claimedRollout === undefined);
  if (pending.length === 0) return [];
  const earliest =
    Math.min(...pending.map((p) => p.spawnedAtMs)) - CLAIM_SLACK_MS;
  const candidates: ClaimableRollout[] = [];
  for (const r of deps.listRollouts()) {
    if (r.timestampMs < earliest || deps.claimedRollouts.has(r.path)) continue;
    const head = deps.readHead(r.path);
    if (head) candidates.push({ ...r, cwd: head.cwd });
  }
  const claims = detectClaims(pending, candidates, deps.claimedRollouts);
  for (const c of claims) deps.apply(c);
  return claims;
}
