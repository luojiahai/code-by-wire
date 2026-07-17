import { useEffect, useState } from "react";
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
  // Main owns the keep-awake state (a live powerSaveBlocker); the button renders whatever the last
  // IPC response said. Fetched on mount so a reloaded renderer stays in sync with main.
  const [caffeinated, setCaffeinated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void window.api.getCaffeinate().then((on) => {
      if (!cancelled) setCaffeinated(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <footer className="no-drag flex h-5 shrink-0 items-stretch justify-between gap-2 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-1 py-0 text-(--ui-text-tertiary)">
      <div className="flex items-stretch">
        <span className="inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] font-medium uppercase text-(--ui-text-secondary)">
          <span aria-hidden className="font-mono text-[8px] leading-none">
            ░▒▓█
          </span>
          FlightDeck
        </span>
        <span className="inline-flex h-full items-center px-1.5 font-mono text-[0.6875rem]">
          {version ? `v${version}` : "—"}
        </span>
      </div>
      <div className="flex items-stretch">
        <button
          type="button"
          title={caffeinated ? "Let computer sleep" : "Keep computer awake"}
          aria-label={
            caffeinated ? "Let computer sleep" : "Keep computer awake"
          }
          aria-pressed={caffeinated}
          onClick={() => {
            void window.api.setCaffeinate(!caffeinated).then(setCaffeinated);
          }}
          className={cx(
            "relative inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem]",
            caffeinated
              ? "bg-(--chrome-action-hover) text-fg"
              : "hover:text-fg",
          )}
        >
          <Icon name="coffee" size={12} />
          Caffeinate
          {caffeinated && <span aria-hidden className="arc-border" />}
        </button>
        <button
          type="button"
          title={terminalOpen ? "Hide terminal" : "Show terminal"}
          aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
          aria-pressed={terminalOpen}
          onClick={() => setTerminalTakeover(!terminalOpen)}
          className={cx(
            "inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem]",
            terminalOpen
              ? "bg-(--chrome-action-hover) text-fg"
              : "hover:text-fg",
          )}
        >
          <Icon name="square-terminal" size={12} />
          Terminal
        </button>
      </div>
    </footer>
  );
}
