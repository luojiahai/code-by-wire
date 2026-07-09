import type { Session } from "@shared/types";
import type { GitInfo } from "@shared/metrics";

/** The Session panel's Git readout, popover-free: the branch (or the short sha on a detached HEAD,
 *  or — before the glance lands — the session's recorded branch) and an amber dot when the tree is
 *  dirty. Ahead/behind sync counts and the old detail popover are intentionally omitted — the branch
 *  name is the signal, and the panel's Lines row already carries the ± footprint. */
export function GitReadout({
  session: s,
  git,
}: {
  session: Session;
  git?: GitInfo | null;
}) {
  const branch = git?.branch ?? null;
  const sha = git?.sha ?? null;
  const dirty = git?.dirty ?? false;
  const headLabel = branch ?? sha ?? s.branch ?? null;
  if (headLabel == null) return <span className="text-fg-muted">-</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-fg">
      <span className="min-w-0 truncate" title={headLabel}>
        {headLabel}
      </span>
      {dirty && (
        <span
          className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent"
          title="Uncommitted changes"
        />
      )}
    </span>
  );
}
