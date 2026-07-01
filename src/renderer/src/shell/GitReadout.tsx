import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { Icon } from "../ui/icons";
import { CopyButton } from "../ui/CopyButton";

const POP_WIDTH = 280;

/** The Identity panel's Git readout: a minimal trigger (the branch, or the short sha on a detached HEAD,
 *  with an amber dot when the tree is dirty) that opens a detail popover. The popover carries the repo
 *  link, the copy-able branch and commit, the PR link, and the sync/diff/status numbers. Before the
 *  glance lands the readout shows the session's recorded branch as plain text (no popover to fill yet);
 *  off a repo-less cwd with no recorded branch it's a bare em dash. The popover is portaled to the body
 *  because the sidebar clips its overflow. Ported from the old annunciator's `GitCell` — same interactive
 *  logic, minus the horizontal-strip `Cell` wrapper (the caller supplies its own label/value row shell). */
export function GitReadout({
  session: s,
  git,
  pr,
}: {
  session: Session;
  git?: GitInfo | null;
  pr?: PrInfo | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const repo = s.project;
  const remoteUrl = git?.remoteUrl ?? null;
  const branch = git?.branch ?? null;
  const sha = git?.sha ?? null;
  const dirty = git?.dirty ?? false;
  const ahead = git?.ahead ?? null;
  const behind = git?.behind ?? null;
  const insertions = git?.insertions ?? 0;
  const deletions = git?.deletions ?? 0;
  // The readout's label: the live branch, the short sha on a detached HEAD, or — before the glance lands
  // or off a repo-less cwd — the session's recorded branch. The popover only opens when there's a live
  // glance to fill it, so a pre-glance label renders as plain text rather than a dead trigger.
  const headLabel = branch ?? sha ?? s.branch ?? null;
  const interactive = git != null && headLabel != null;

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(
      8,
      Math.min(r.right - POP_WIDTH, window.innerWidth - POP_WIDTH - 8),
    );
    setPos({ left, top: r.bottom + 4 });
  }, []);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Keep the popover glued to its trigger on scroll/resize rather than dismissing it. A sidebar panel
    // scrolling (the panel stack above/below it) must NOT close the popover — only re-anchor it. Capture
    // phase so a scroll in any descendant re-places it too.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      {interactive ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? popId : undefined}
          className="flex min-w-0 items-center gap-1.5 text-fg hover:text-fg-muted"
        >
          <span className="min-w-0 truncate">{headLabel}</span>
          {dirty && (
            <span
              className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent"
              title="Uncommitted changes"
            />
          )}
          <Icon
            name="chevron-down"
            size={12}
            className="shrink-0 text-fg-faint"
          />
        </button>
      ) : headLabel != null ? (
        <span className="min-w-0 truncate text-fg">{headLabel}</span>
      ) : (
        <span className="text-fg-muted">—</span>
      )}
      {open && pos
        ? createPortal(
            <div
              id={popId}
              ref={popRef}
              role="dialog"
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                width: POP_WIDTH,
              }}
              className="z-50 rounded-lg border border-ink-700 bg-ink-900 p-2.5 shadow-xl"
            >
              <div className="mb-2 px-1 font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
                Git detail
              </div>
              <Row label="Repository">
                {remoteUrl ? (
                  <button
                    type="button"
                    onClick={() => void window.api.openExternal(remoteUrl)}
                    className="flex min-w-0 cursor-pointer items-center gap-1 text-fg hover:underline"
                  >
                    <span className="min-w-0 truncate">{repo}</span>
                    <Icon
                      name="arrow-up-right"
                      size={11}
                      className="shrink-0 text-fg-faint"
                    />
                  </button>
                ) : (
                  <span className="min-w-0 truncate text-fg">{repo}</span>
                )}
              </Row>
              {branch && (
                <Row label="Branch">
                  <span className="min-w-0 truncate text-fg">{branch}</span>
                  <CopyButton value={branch} label="Copy branch name" />
                </Row>
              )}
              {pr && (
                <Row label="Pull request">
                  <button
                    type="button"
                    onClick={() => void window.api.openExternal(pr.url)}
                    className="cursor-pointer text-accent underline underline-offset-2 hover:text-accent-bright"
                  >
                    #{pr.number}
                  </button>
                </Row>
              )}
              {ahead != null && behind != null && (
                <Row label="Sync">
                  <span className="text-fg">↑{ahead}</span>
                  <span className="text-fg-muted">↓{behind}</span>
                </Row>
              )}
              <Row label="Changes">
                <span className="text-ok">+{insertions}</span>
                <span className="text-danger">−{deletions}</span>
              </Row>
              {sha && (
                <Row label="Commit">
                  <span className="text-fg">{sha}</span>
                  <CopyButton value={sha} label="Copy commit sha" />
                </Row>
              )}
              <Row label="Status">
                {dirty ? (
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <span className="h-[6px] w-[6px] rounded-full bg-accent" />
                    dirty
                  </span>
                ) : (
                  <span className="text-fg-muted">clean</span>
                )}
              </Row>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** One labeled row in the Git popover: a faint key on the left, a mono value cluster on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-ink-850 px-1 py-1.5 first:border-t-0">
      <span className="shrink-0 text-meta text-fg-faint">{label}</span>
      <span className="flex min-w-0 items-center gap-2 font-mono text-aux">
        {children}
      </span>
    </div>
  );
}
