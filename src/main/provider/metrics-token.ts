import type { GitInfo, PrInfo } from "@shared/metrics";

/** A stable 32-bit hash of the composite metrics token (transcript mtime + git/voice/remote state), so the
 *  renderer's numeric `since` dedupe works even though those changes aren't mtimes. */
function hashToken(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The git portion of the metrics change token: a compact string of the state that should re-trigger a
 *  recompute, or 'nogit' when the cwd isn't a repo. */
function gitTokenStr(git: GitInfo | null): string {
  return git
    ? `${git.sha}:${git.insertions}:${git.deletions}:${git.dirty}:${git.ahead}:${git.behind}`
    : "nogit";
}

/** The PR portion of the metrics change token: the PR number plus the fields the SessionPanel PR row
 *  renders. Folded in so a background `gh` fetch that changes only the review state still re-renders. */
function prTokenStr(pr: PrInfo | null): string {
  return pr
    ? `pr:${pr.number}:${pr.state ?? ""}:${pr.reviewDecision ?? ""}:${pr.title ?? ""}`
    : "nopr";
}

/** The lazy metric sources folded into the change token. Agents without a voice/remote concept pass null. */
export interface MetricsTokenSources {
  git: GitInfo | null;
  pr: PrInfo | null;
  voice: boolean | null;
  remote: boolean | null;
}

/** The composite change token: transcript mtime plus every source that should re-trigger a recompute.
 *  Shared across providers so every readMetrics speaks the same token dialect. */
export function metricsToken(mtimeMs: number, s: MetricsTokenSources): number {
  return hashToken(
    `${mtimeMs}|${gitTokenStr(s.git)}|${prTokenStr(s.pr)}|${s.voice}|${s.remote}`,
  );
}
