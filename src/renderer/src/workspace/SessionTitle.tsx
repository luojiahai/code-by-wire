import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import { Icon } from "../ui/icons";

/**
 * The header session title with inline rename. Display mode shows the truncated title and a pencil that
 * fades in on header hover (the header is the `group/header`); clicking the pencil or the title opens an
 * inline input. Every commit routes through the input's onBlur (Enter and Esc both call blur), so a
 * rename fires exactly once. Enter/blur saves, Esc cancels, an empty value clears the override (reverting
 * to the derived/live name). Applies to any session — the override is a cbw-side display name keyed by id.
 */
export function SessionTitle({
  session: s,
  onRename,
}: {
  session: Session;
  onRename: (id: string, title: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set for the lifetime of one Esc-cancel so the blur it triggers doesn't also save.
  const cancelledRef = useRef(false);
  // Synchronous mirror of `editing` so the unmount flush below can tell a still-pending edit from one a
  // blur already committed, without waiting for the `editing` state to re-render.
  const editingRef = useRef(false);

  // Seed the draft from the current title each time the editor opens, so a rename that landed via a
  // background sync is what the user edits, not a stale draft.
  function open(): void {
    setDraft(s.title);
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
    if (trimmed !== s.title)
      onRename(s.id, trimmed.length > 0 ? trimmed : null);
  }

  // Switching sessions unmounts this component (Workspace is keyed by session id) while the input may
  // still be open. React fires no onBlur on unmount, so a pending edit would vanish — flush it here. The
  // ref tracks the latest commit so the cleanup saves the current draft, not a stale closure; commit()
  // no-ops once editingRef has cleared, so a normal Enter/blur that already saved isn't run twice.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

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
        className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-sm font-semibold text-fg outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      title="Rename session"
      className="flex min-w-0 items-center gap-1.5 text-left"
    >
      <span className="min-w-0 truncate text-sm font-semibold text-fg">
        {s.title}
      </span>
      <Icon
        name="pencil"
        size={12}
        className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover/header:opacity-100 group-focus-within/header:opacity-100"
      />
    </button>
  );
}
