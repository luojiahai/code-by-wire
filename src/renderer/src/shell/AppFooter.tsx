import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import {
  $terminalAllowed,
  $terminalTakeover,
  $terminalVisible,
  setTerminalTakeover,
} from "../shell-terminal/store";

/** The hermes statusbar (design spec §footer): a 20px strip on the sidebar surface with 11px
 *  items. The wordmark is prefixed with the literal ░▒▓█ mark — no SVG glyph or gradient chip. */
export function AppFooter({ version }: { version: string | null }) {
  const { t } = useI18n();
  // The terminal is a session-workspace surface: off-route it's suppressed and this button goes
  // inert, so it reads the effective visibility for its pressed state and the route gate for
  // enablement. The toggle writes the preference, so it reads the preference — deriving the next
  // value from the (route-suppressed) visibility would be a silent no-op off-route.
  const terminalOpen = useStore($terminalVisible);
  const terminalWanted = useStore($terminalTakeover);
  const terminalAllowed = useStore($terminalAllowed);
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
  const terminalLabel = !terminalAllowed
    ? t.shell.footer.terminalUnavailable
    : terminalOpen
      ? t.shell.footer.hideTerminal
      : t.shell.footer.showTerminal;
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
      <div className="flex items-stretch">
        <button
          type="button"
          title={
            caffeinated ? t.shell.footer.letSleep : t.shell.footer.keepAwake
          }
          aria-label={
            caffeinated ? t.shell.footer.letSleep : t.shell.footer.keepAwake
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
          {t.shell.footer.caffeinate}
          {caffeinated && <span aria-hidden className="arc-border" />}
        </button>
        <button
          type="button"
          title={terminalLabel}
          aria-label={terminalLabel}
          // aria-disabled, not disabled: Chromium suppresses hit-testing on a disabled control, so
          // the native tooltip never renders and the button leaves the tab order — which would hide
          // the one affordance explaining why it's inert. Inert-but-focusable keeps the hover
          // tooltip and keyboard reach; the onClick guard does the actual disabling.
          aria-disabled={!terminalAllowed}
          // Off-route the preference is neither on nor off as far as this button is concerned —
          // announcing "not pressed" would contradict the terminal the user left open.
          aria-pressed={terminalAllowed ? terminalOpen : undefined}
          onClick={() => {
            if (!terminalAllowed) return;
            setTerminalTakeover(!terminalWanted);
          }}
          className={cx(
            "inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem]",
            !terminalAllowed
              ? "cursor-default opacity-40"
              : terminalOpen
                ? "bg-(--chrome-action-hover) text-fg"
                : "hover:text-fg",
          )}
        >
          <Icon name="square-terminal" size={12} />
          {t.shell.footer.terminal}
        </button>
      </div>
    </footer>
  );
}
