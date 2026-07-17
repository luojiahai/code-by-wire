import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { Session } from "@shared/types";
import { OPEN_IN_FAILED_MESSAGE, type OpenInTarget } from "@shared/ipc";
import { useI18n } from "../i18n";
import {
  useSessionActions,
  type SessionActions,
} from "../workspace/session-actions";
import { openInItems, type OpenInItem } from "../workspace/open-in-items";

const MENU_WIDTH = 256;

export interface SessionRenameField {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export interface SessionMenuController {
  open: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  menuId: string;
  pos: { left: number; top: number } | null;
  editing: boolean;
  openEdit: () => void;
  /** Whether the session is currently pinned (drives the Pin/Unpin item's label and icon). */
  pinned: boolean;
  /** Toggle the pin and close the menu. */
  togglePin: () => void;
  renameField: SessionRenameField;
  items: OpenInItem[];
  openInBusy: boolean;
  openInError: string | null;
  handleOpenIn: (target: OpenInTarget) => Promise<void>;
  adopt: SessionActions["adopt"];
  fork: SessionActions["fork"];
  end: SessionActions["end"];
  live: boolean;
  adoptDisabled: boolean;
  adoptTitle: string | undefined;
  forkDisabled: boolean;
  forkTitle: string | undefined;
  endTitle: string;
}

/** The Adopt/Fork/End/Rename/Open-in state machine shared by every trigger that opens a session's
 *  action menu — the header title (`SessionMenu`) and the sidebar row's 3-dot button (`SessionRow`).
 *  Extracted from the original single-trigger `SessionMenu` so a future gate/copy change can't drift
 *  between the two surfaces. Owns dropdown open/position state, the inline-rename draft, and the
 *  Adopt/Fork/End/Open-in wiring; callers own their own trigger markup and where `editing` output lands. */
export function useSessionMenu(
  session: Session,
  canSpawn: boolean,
  callbacks: {
    onAdopt: (id: string) => Promise<void>;
    onFork: (session: Session) => Promise<void>;
    onEnd: (id: string) => void;
    onRename: (id: string, title: string | null) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
  },
): SessionMenuController {
  const { t } = useI18n();
  const { onRename } = callbacks;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [openInBusy, setOpenInBusy] = useState(false);
  const [openInError, setOpenInError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Set for the lifetime of one Esc-cancel so the blur it triggers doesn't also save.
  const cancelledRef = useRef(false);
  // Synchronous mirror of `editing` so the unmount flush below can tell a still-pending edit from one a
  // blur already committed, without waiting for the `editing` state to re-render.
  const editingRef = useRef(false);
  const menuId = useId();

  const { ended, live, canAdopt, adopt, fork, end } = useSessionActions(
    session,
    callbacks,
  );

  // The dropdown is portaled to `document.body` (its trigger may sit somewhere overflow-clipped), so its
  // position has to be computed from the trigger's live rect rather than left to CSS.
  const place = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(r.left, window.innerWidth - MENU_WIDTH - 8);
    setPos({ left, top: r.bottom + 6 });
  }, []);

  function toggleMenu(): void {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  }

  function closeMenu(): void {
    setOpen(false);
  }

  const pinned = session.pinnedAtMs !== undefined;
  function togglePin(): void {
    callbacks.onTogglePin(session.id, !pinned);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
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

  // Drop a stale Open-in error whenever the menu closes, so reopening starts clean.
  useEffect(() => {
    if (!open) setOpenInError(null);
  }, [open]);

  // Seed the draft from the current title each time the editor opens, so a rename that landed via a
  // background sync is what the user edits, not a stale draft. Closes the dropdown first.
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
    if (trimmed !== session.title)
      onRename(session.id, trimmed.length > 0 ? trimmed : null);
  }
  // A caller unmounting (e.g. switching sessions) fires no onBlur while the input is open — flush here.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  async function handleOpenIn(target: OpenInTarget): Promise<void> {
    if (openInBusy) return;
    setOpenInBusy(true);
    setOpenInError(null);
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

  const adoptDisabled = !canAdopt || !canSpawn || !session.resumable;
  const adoptTitle = !canSpawn
    ? t.settings.cli.unavailableReason
    : !session.resumable
      ? t.shell.sessionMenu.adoptTitleNoConversation
      : !canAdopt
        ? t.shell.sessionMenu.adoptTitlePending
        : undefined;

  const forkGateExtra = ended || session.management === "observed";
  const forkDisabled = forkGateExtra || !canSpawn || !session.resumable;
  const forkTitle = !canSpawn
    ? t.settings.cli.unavailableReason
    : !session.resumable
      ? t.shell.sessionMenu.forkTitleNoConversation
      : ended
        ? t.shell.sessionMenu.forkTitleEnded
        : session.management === "observed"
          ? t.shell.sessionMenu.forkTitleObserved
          : undefined;

  const endTitle = live
    ? t.shell.sessionMenu.endTitleLive
    : t.shell.sessionMenu.endTitleUnavailable;

  return {
    open,
    toggleMenu,
    closeMenu,
    rootRef,
    menuRef,
    menuId,
    pos,
    editing,
    openEdit,
    pinned,
    togglePin,
    renameField: {
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelledRef.current = true;
          inputRef.current?.blur();
        }
      },
      inputRef,
    },
    items: openInItems(window.api.platform),
    openInBusy,
    openInError,
    handleOpenIn,
    adopt,
    fork,
    end,
    live,
    adoptDisabled,
    adoptTitle,
    forkDisabled,
    forkTitle,
    endTitle,
  };
}
