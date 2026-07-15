import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { setTerminalTakeover } from "./store";
import {
  $activeTerminalId,
  $terminals,
  closeAllTerminals,
  closeOtherTerminals,
  closeTerminal,
  createTerminal,
  selectTerminal,
  type TerminalEntry,
} from "./terminals";

const RAIL_ACTION =
  "grid size-7 place-items-center rounded-sm text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-fg [-webkit-app-region:no-drag]";

interface MenuState {
  x: number;
  y: number;
  termId: string;
}

/** Thin icon "bookmark" strip on the pane's outer edge, shown whenever a terminal exists. Each
 *  square is a tab; close via the shell's `exit`, middle-click, or the context menu. */
export function TerminalRail({ asRow }: { asRow: boolean }) {
  const terminals = useStore($terminals);
  const activeId = useStore($activeTerminalId);
  const [menu, setMenu] = useState<MenuState | null>(null);

  return (
    // Side-specific border colors: the subtle quaternary left edge separates the rail from the
    // terminal body; the row-mode top edge uses secondary to match the body column's seam border
    // (see TerminalPaneChrome) into one continuous line against the metrics sidebar above.
    <div
      className={cx(
        "group/rail relative z-40 flex h-full w-9 shrink-0 flex-col items-center border-l border-l-(--ui-stroke-quaternary) bg-(--color-code-surface)",
        asRow && "border-t border-t-(--ui-stroke-secondary)",
      )}
    >
      <ul
        aria-label="Terminals"
        className="flex min-h-0 flex-1 flex-col items-center gap-0.5 self-stretch overflow-y-auto overflow-x-hidden overscroll-contain py-1 [scrollbar-width:none]"
        role="tablist"
      >
        {terminals.map((term, index) => (
          <TerminalRailItem
            active={term.id === activeId}
            index={index}
            key={term.id}
            onMenu={(x, y) => setMenu({ x, y, termId: term.id })}
            term={term}
          />
        ))}
        <li className="flex w-full justify-center">
          <button
            aria-label="New terminal"
            className={cx(RAIL_ACTION, "text-(--ui-text-quaternary)")}
            onClick={() => createTerminal()}
            title="New terminal"
            type="button"
          >
            <Icon name="plus" size={13} />
          </button>
        </li>
      </ul>

      <div className="flex shrink-0 flex-col items-center pb-1.5">
        <button
          aria-label="Hide terminal"
          className={cx(
            RAIL_ACTION,
            "opacity-0 transition-opacity group-hover/rail:opacity-100",
          )}
          onClick={() => setTerminalTakeover(false)}
          title="Hide terminal"
          type="button"
        >
          <Icon name="chevron-down" size={13} />
        </button>
      </div>

      {menu && (
        <RailContextMenu
          canCloseOthers={terminals.length > 1}
          menu={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function TerminalRailItem({
  term,
  index,
  active,
  onMenu,
}: {
  term: TerminalEntry;
  index: number;
  active: boolean;
  onMenu: (x: number, y: number) => void;
}) {
  const label = `${index + 1}. ${term.title}`;
  return (
    <li className="flex w-full justify-center [-webkit-app-region:no-drag]">
      <button
        aria-label={label}
        aria-selected={active}
        className={cx(
          "grid size-7 place-items-center rounded-sm transition-colors",
          active
            ? "bg-(--chrome-action-hover) text-fg"
            : "text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-fg",
        )}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            closeTerminal(term.id);
          }
        }}
        onClick={() => selectTerminal(term.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        role="tab"
        title={label}
        type="button"
      >
        <Icon name="square-terminal" size={14} />
      </button>
    </li>
  );
}

/** Minimal local context menu (cbw has no shared primitive): a fixed-position card dismissed by
 *  click-away or Escape, clamped inside the viewport. */
function RailContextMenu({
  menu,
  canCloseOthers,
  onClose,
}: {
  menu: MenuState;
  canCloseOthers: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const item =
    "block w-full px-2.5 py-1 text-left text-[0.6875rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent";
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 min-w-36 rounded-sm border border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) py-1 shadow-lg"
        role="menu"
        style={{
          left: Math.min(menu.x, window.innerWidth - 160),
          top: Math.min(menu.y, window.innerHeight - 140),
        }}
      >
        <button
          className={item}
          onClick={run(() => closeTerminal(menu.termId))}
          type="button"
        >
          Close
        </button>
        <button
          className={item}
          disabled={!canCloseOthers}
          onClick={run(() => closeOtherTerminals(menu.termId))}
          type="button"
        >
          Close others
        </button>
        <button className={item} onClick={run(closeAllTerminals)} type="button">
          Close all
        </button>
        <div className="mx-2 my-1 h-px bg-(--ui-stroke-tertiary)" />
        <button
          className={item}
          onClick={run(() => setTerminalTakeover(false))}
          type="button"
        >
          Hide terminal
        </button>
      </div>
    </>
  );
}
