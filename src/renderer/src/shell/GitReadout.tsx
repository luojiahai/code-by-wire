import type { Session } from "@shared/types";
import type { GitInfo } from "@shared/metrics";
import { CopyButton } from "../ui/CopyButton";
import { useI18n } from "../i18n";

/** The Session panel's Branch readout, popover-free: purely the branch name (or — before the glance
 *  lands — the session's recorded branch) plus a copy button. Branch-only by design: a detached HEAD
 *  has no branch, so the row dashes rather than standing in a sha. Dirty/ahead-behind decorations and
 *  the old detail popover are intentionally omitted — the branch name is the signal. */
export function GitReadout({
  session: s,
  git,
}: {
  session: Session;
  git?: GitInfo | null;
}) {
  const { t } = useI18n();
  // The session's recorded branch stands in only until the glance lands — never over it. A landed
  // glance with no branch means a detached HEAD, and the row dashes rather than naming a branch the
  // worktree has already left (which the copy button would then hand to the clipboard).
  // `undefined` is the only "not landed yet" state — a null glance is a landed one that says the cwd
  // isn't a work tree, and dashes like a detached HEAD rather than reviving the recorded branch.
  const branch = (git === undefined ? s.branch : git?.branch) ?? null;
  if (branch == null) return <span className="text-fg-muted">-</span>;
  return (
    // items-start, not items-center: a wrapped branch keeps the copy button on its first line (the
    // 16px-tall button matches the line box as-is).
    <span className="flex min-w-0 items-start gap-1.5 text-fg">
      <span className="min-w-0 wrap-anywhere" title={branch}>
        {branch}
      </span>
      <CopyButton value={branch} label={t.shell.gitReadout.copyBranch} />
    </span>
  );
}
