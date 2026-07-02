import type { Session } from "@shared/types";
import type { GitInfo } from "@shared/metrics";

/** The Session panel's Git readout, popover-free: the branch (or the short sha on a detached HEAD,
 *  or — before the glance lands — the session's recorded branch), an amber dot when the tree is
 *  dirty, and the ↑ahead↓behind sync counts when the glance carries them. The old detail popover is
 *  gone: its Changes ± duplicated the panel's Lines row, and the PR link now has its own panel row. */
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
  const ahead = git?.ahead ?? null;
  const behind = git?.behind ?? null;
  const headLabel = branch ?? sha ?? s.branch ?? null;
  if (headLabel == null) return <span className="text-fg-muted">—</span>;
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
      {ahead != null && behind != null && (
        <span className="shrink-0 text-fg-muted">
          ↑{ahead}↓{behind}
        </span>
      )}
    </span>
  );
}
