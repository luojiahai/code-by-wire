import { useEffect, useId, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import { OPEN_IN_FAILED_MESSAGE, type OpenInTarget } from "@shared/ipc";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useSessionActions } from "../workspace/session-actions";
import { openInItems } from "../workspace/open-in-items";

/**
 * The middle header's session-name dropdown (design spec §5): one menu that consolidates what used to be
 * four separate header pieces — the inline-rename title (`SessionTitle`), the Managed/Observed badge, the
 * Adopt/Fork/End cluster (`HeaderActions`), and the "Open in" dropdown (`OpenInMenu`). The trigger is the
 * title + chevron + badge; clicking it (outside-click/Escape close it, modeled on `OpenInMenu`'s pattern)
 * toggles the dropdown, whose six action rows are ALWAYS rendered — only `disabled`/`title` vary, per the
 * design's "never hide an action, dim the unavailable ones with a reason" rule. `Rename` swaps the trigger
 * for an inline input (closing the dropdown first, so the two never show at once — same state machine as
 * `SessionTitle`, adapted to this trigger's shape). Adopt/Fork/End share their state machine with
 * `HeaderActions` via `useSessionActions`; the trailing rows fold `OpenInMenu`'s two targets in flat (no
 * nested flyout — unnecessary complexity for two items).
 */
export function SessionMenu({
  session,
  canSpawn,
  onAdopt,
  onFork,
  onEnd,
  onRename,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable; Adopt and Fork both resume by spawning it. */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  /** End the running Managed session (kills the pty we own). */
  onEnd: (id: string) => void;
  /** Persist a display-name override for this session (null/empty clears it). */
  onRename: (id: string, title: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [openInBusy, setOpenInBusy] = useState(false);
  const [openInError, setOpenInError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set for the lifetime of one Esc-cancel so the blur it triggers doesn't also save (mirrors SessionTitle).
  const cancelledRef = useRef(false);
  // Synchronous mirror of `editing` so the unmount flush below can tell a still-pending edit from one a
  // blur already committed, without waiting for the `editing` state to re-render.
  const editingRef = useRef(false);
  const menuId = useId();

  const { ended, live, canAdopt, adopt, fork, end } = useSessionActions(
    session,
    { onAdopt, onFork, onEnd },
  );

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Drop a stale Open-in error whenever the menu closes, so reopening starts clean (mirrors OpenInMenu).
  useEffect(() => {
    if (!open) setOpenInError(null);
  }, [open]);

  // Seed the draft from the current title each time the editor opens, so a rename that landed via a
  // background sync is what the user edits, not a stale draft. Closes the dropdown first — the trigger
  // swaps to the input, so the two can never show at once.
  function openEdit(): void {
    setOpen(false);
    setDraft(session.title);
    editingRef.current = true;
    setEditing(true);
  }
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit(): void {
    if (!editingRef.current) return; // already committed — don't let a later unmount flush re-run it
    editingRef.current = false;
    setEditing(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    // Only call through when the value actually changed, so a no-op edit doesn't rebuild the overview.
    if (trimmed !== session.title)
      onRename(session.id, trimmed.length > 0 ? trimmed : null);
  }
  // Switching sessions unmounts this component (Workspace is keyed by session id) while the input may
  // still be open. React fires no onBlur on unmount, so a pending edit would vanish — flush it here. The
  // ref tracks the latest commit so the cleanup saves the current draft, not a stale closure; commit()
  // no-ops once editingRef has cleared, so a normal Enter/blur that already saved isn't run twice.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  async function handleOpenIn(target: OpenInTarget): Promise<void> {
    if (openInBusy) return; // one open at a time; a double-click can't fire two shell opens
    setOpenInBusy(true);
    setOpenInError(null); // clear any prior failure so a stale message never shows under the in-flight attempt
    try {
      const res = await window.api.openIn(session.id, target);
      if (res.ok) setOpen(false);
      else setOpenInError(res.error);
    } catch {
      setOpenInError(OPEN_IN_FAILED_MESSAGE);
    } finally {
      setOpenInBusy(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="Rename session"
        value={draft}
        maxLength={MAX_SESSION_TITLE_LEN}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur(); // commit via the single onBlur path
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            inputRef.current?.blur(); // cancel via onBlur, guarded by cancelledRef
          }
        }}
        className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-subhead font-medium text-fg outline-none"
      />
    );
  }

  const badgeLabel = session.management === "managed" ? "Managed" : "Observed";
  const items = openInItems(window.api.platform);

  // Adopt: the task's stated gate (`!canAdopt || !canSpawn`) plus the `resumable` check ResumeButton
  // already enforces for Adopt today — dropping it here would let a not-yet-resumable session's Adopt row
  // read enabled, a real regression versus HeaderActions.
  const adoptDisabled = !canAdopt || !canSpawn || !session.resumable;
  const adoptTitle = !canSpawn
    ? "Claude Code CLI isn't usable — see Sys status in the title bar."
    : !session.resumable
      ? "Nothing to adopt — this session has no saved conversation."
      : !canAdopt
        ? "This session just exited. Adopt is available in a moment."
        : undefined;

  // Fork: the task's explicit ended/observed gate, PLUS the existing canSpawn/resumable gates
  // ResumeButton already enforces — both apply, since skipping the latter would be a regression versus
  // what HeaderActions enforces today.
  const forkGateExtra = ended || session.management === "observed";
  const forkDisabled = forkGateExtra || !canSpawn || !session.resumable;
  const forkTitle = !canSpawn
    ? "Claude Code CLI isn't usable — see Sys status in the title bar."
    : !session.resumable
      ? "Nothing to fork — this session has no saved conversation."
      : ended
        ? "This session has ended — there's nothing live left to fork."
        : session.management === "observed"
          ? "Fork isn't offered for an observed session — it isn't a session this app owns."
          : undefined;

  const endTitle = live
    ? "End this session"
    : "End is only available for a live session you manage.";

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        title="Session menu"
        className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-ink-850"
      >
        <span className="min-w-0 truncate text-subhead font-medium text-fg">
          {session.title}
        </span>
        <Icon
          name="chevron-down"
          size={13}
          className={cx(
            "shrink-0 text-fg-faint transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="shrink-0 rounded border border-ink-700 px-1.5 py-0.5 font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
          {badgeLabel}
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-xl"
        >
          <MenuItem
            icon="pin"
            label="Pin"
            title="Pinning sessions is coming soon."
            onClick={() => setOpen(false)}
          />
          <MenuItem
            icon="copy"
            label="Copy session ID"
            title={session.id}
            onClick={() => {
              void window.api.clipboardWriteText(session.id);
              setOpen(false);
            }}
          />
          <MenuItem icon="pencil" label="Rename" onClick={openEdit} />

          {adopt.error && (
            <p role="alert" className="px-2 py-1 text-meta text-danger">
              {adopt.error}
            </p>
          )}
          <MenuItem
            icon="git-pull-request-arrow"
            label={adopt.busy ? "Adopting…" : "Adopt"}
            onClick={adopt.request}
            disabled={adoptDisabled || adopt.busy}
            title={adoptTitle}
          />

          {fork.error && (
            <p role="alert" className="px-2 py-1 text-meta text-danger">
              {fork.error}
            </p>
          )}
          <MenuItem
            icon="git-branch"
            label={fork.busy ? "Forking…" : "Fork"}
            onClick={fork.request}
            disabled={forkDisabled || fork.busy}
            title={forkTitle}
          />

          <MenuItem
            icon="square"
            label="End session"
            onClick={end.request}
            disabled={!live}
            title={endTitle}
            danger
          />

          <div
            role="separator"
            aria-orientation="horizontal"
            className="my-1 h-px bg-ink-800"
          />

          <div className="px-2 pb-1 pt-0.5 font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
            Open in
          </div>
          {items.map((item) => (
            <MenuItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => void handleOpenIn(item.key)}
              disabled={openInBusy}
            />
          ))}
          {openInError && (
            <p role="alert" className="mt-1 px-2 py-1 text-meta text-danger">
              {openInError}
            </p>
          )}
        </div>
      )}

      {adopt.confirmOpen && (
        <ConfirmDialog
          title="Resume a session with no recorded model?"
          body="This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?"
          confirmLabel="Resume anyway"
          onCancel={adopt.confirmNo}
          onConfirm={adopt.confirmYes}
        />
      )}
      {fork.confirmOpen && (
        <ConfirmDialog
          title="Fork a session with no recorded model?"
          body="This session never recorded a model — it likely errored before its first turn — so forking it may fail with a model error. Continue anyway?"
          confirmLabel="Fork anyway"
          onCancel={fork.confirmNo}
          onConfirm={fork.confirmYes}
        />
      )}
      {end.confirmOpen && (
        <ConfirmDialog
          title="End this session?"
          body="A turn is in progress and will be interrupted. The conversation is saved and can be resumed later with Adopt."
          confirmLabel="End session"
          tone="danger"
          onConfirm={end.confirmYes}
          onCancel={end.confirmNo}
        />
      )}
    </div>
  );
}

/** One always-rendered dropdown row: an icon + label, whose `disabled`/`title` vary by capability but the
 *  row itself never disappears (the design's "never hide an action, dim the unavailable ones" rule).
 *  `danger` mutes it toward the danger hue, for End session. */
function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-aux transition-colors focus-visible:outline-none focus-visible:bg-ink-800 disabled:cursor-default disabled:opacity-40",
        danger
          ? "text-danger enabled:hover:bg-danger/10"
          : "text-fg-muted enabled:hover:bg-ink-800 enabled:hover:text-fg",
      )}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}
