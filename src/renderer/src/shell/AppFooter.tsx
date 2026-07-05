import { useStore } from "@nanostores/react";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import {
  $terminalTakeover,
  setTerminalTakeover,
} from "../shell-terminal/store";

/** The hermes statusbar (design spec §footer): a 20px strip on the sidebar surface with 11px
 *  items. The wordmark is prefixed with the literal ░▒▓█ mark — no SVG glyph or gradient chip. */
export function AppFooter({ version }: { version: string | null }) {
  const terminalOpen = useStore($terminalTakeover);
  return (
    <footer className="no-drag flex h-5 shrink-0 items-stretch justify-between gap-2 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-1 py-0 text-(--ui-text-tertiary)">
      <div className="flex items-stretch">
        <span className="inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] font-medium uppercase text-(--ui-text-secondary)">
          <span aria-hidden className="font-mono text-[8px] leading-none">
            ░▒▓█
          </span>
          code-by-wire
        </span>
        <span className="inline-flex h-full items-center px-1.5 font-mono text-[0.6875rem]">
          {version ? `v${version}` : "—"}
        </span>
      </div>
      <button
        type="button"
        title={terminalOpen ? "Hide terminal" : "Show terminal"}
        aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
        aria-pressed={terminalOpen}
        onClick={() => setTerminalTakeover(!terminalOpen)}
        className={cx(
          "inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem]",
          terminalOpen ? "bg-(--chrome-action-hover) text-fg" : "hover:text-fg",
        )}
      >
        <Icon name="square-terminal" size={12} />
        Terminal
      </button>
    </footer>
  );
}
