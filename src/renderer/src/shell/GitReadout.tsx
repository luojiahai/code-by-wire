import type { Session } from "@shared/types";
import type { GitInfo } from "@shared/metrics";
import { CopyButton } from "../ui/CopyButton";
import { useI18n } from "../i18n";

/** The Session panel's Branch readout, popover-free: the branch name (or — before the glance lands —
 *  the session's recorded branch) and an amber dot when the tree is dirty. Branch-only by design: a
 *  detached HEAD has no branch, so the row dashes rather than standing in a sha. Ahead/behind sync
 *  counts and the old detail popover are intentionally omitted — the branch name is the signal, and
 *  the panel's Lines row already carries the ± footprint. */
export function GitReadout({
  session: s,
  git,
}: {
  session: Session;
  git?: GitInfo | null;
}) {
  const { t } = useI18n();
  const branch = git?.branch ?? s.branch ?? null;
  const dirty = git?.dirty ?? false;
  if (branch == null) return <span className="text-fg-muted">-</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-fg">
      <span className="min-w-0 wrap-anywhere" title={branch}>
        {branch}
      </span>
      {dirty && (
        <span
          className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent"
          title={t.shell.gitReadout.uncommittedChanges}
        />
      )}
      <CopyButton value={branch} label={t.shell.gitReadout.copyBranch} />
    </span>
  );
}
