import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import { isMacPlatform } from "@shared/platform";
import { cx, ScrollHintShadow } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { useFullscreen } from "../ui/use-fullscreen";
import { useI18n } from "../i18n";
import { headerRightPaddingPx, titlebarContentInsetPx } from "./titlebar";

/**
 * The middle column's own in-column header: a draggable strip that carries the active session's
 * menu — name and chevron, bundled in `SessionMenu` and passed in as
 * `menu` — or a plain title when there's no session, plus the Claude Code ⇄ Transcript view switcher. The
 * sidebar toggles live in the fixed `TitlebarControls` clusters, NOT here — nothing in this header
 * mounts or unmounts when a pane toggles.
 *
 * Both paddings snap (hermes behavior — no transition): they change in the same frame as the
 * pane's grid track, so the title reflows exactly once, in sync with the sidebar. When the left
 * pane is docked, its own strip covers the traffic lights and the left cluster, so 14px suffices;
 * when it isn't, this header is the visual left edge and insets past lights + cluster. The right
 * padding mirrors that for the right cluster, which only floats over this header while a session
 * exists and the right pane isn't docked.
 */
export function MiddleHeader({
  title,
  session,
  transcriptOn,
  onToggleTranscript,
  onExitDrill,
  drilled,
  leftEdgeExposed,
  rightEdgeExposed,
  menu,
}: {
  title: string;
  session: Session | null;
  transcriptOn: boolean;
  onToggleTranscript: () => void;
  /** Clears any active subagent drill. Called when the user explicitly leaves the Transcript side via
   *  "Claude Code", so returning to Transcript later always shows the main session, never a stale drill. */
  onExitDrill: () => void;
  /** True while a subagent drill is showing its own copy of this header's bottom shadow, directly
   *  under its breadcrumb bar — suppresses this one so the two don't stack over the breadcrumb. */
  drilled: boolean;
  /** True whenever the left pane isn't actually docked next to this header — closed by the user,
   *  or force-collapsed by a narrow window. Rendered state, not the stored preference. */
  leftEdgeExposed: boolean;
  /** Same, for the right pane. Only matters while a session exists (the right cluster is hidden
   *  otherwise). */
  rightEdgeExposed: boolean;
  menu: ReactNode;
}) {
  const { t } = useI18n();
  const isMac = isMacPlatform(window.api.platform);
  const isFullscreen = useFullscreen();
  const paddingLeft = leftEdgeExposed
    ? titlebarContentInsetPx(isMac, isFullscreen)
    : 12;
  const paddingRight = headerRightPaddingPx(
    Boolean(session) && rightEdgeExposed,
  );
  // The live in-app terminal (Workspace's TerminalView, via terminal/xterm-factory.ts) is the one
  // panel below this header whose background follows Terminal theme instead of App theme — every
  // other case below (Transcript, ObservedTerminal, or no session) stays on this header's own
  // --ui-chat-surface-background, so fading to transparent there is already correct. Mirrors
  // Workspace.tsx's own hasLiveTerminal check (management === "managed" && state !== "ended").
  const terminalBelow =
    !transcriptOn &&
    session !== null &&
    session.management === "managed" &&
    session.state !== "ended";

  return (
    <>
      <header
        className={cx(
          "drag-region relative flex shrink-0 select-none items-center gap-3 overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background)",
          isMac && "title-bar",
        )}
        style={{ height: "var(--titlebar-height)", paddingLeft, paddingRight }}
      >
        {session ? (
          menu
        ) : (
          <span className="truncate text-[0.75rem] font-medium leading-none text-(--ui-text-secondary)">
            {title}
          </span>
        )}
        <div className="no-drag ml-auto flex items-center gap-2">
          {session && (
            <div
              role="group"
              aria-label={t.shell.middleHeader.viewGroupLabel}
              className="flex shrink-0 items-center rounded-sm border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] p-[2px]"
            >
              <ViewSegment
                icon="terminal"
                label={t.shell.middleHeader.claudeCode}
                active={!transcriptOn}
                onSelect={() => {
                  if (transcriptOn) {
                    onToggleTranscript();
                    onExitDrill();
                  }
                }}
              />
              <ViewSegment
                icon="scroll-text"
                label={t.shell.middleHeader.transcript}
                active={transcriptOn}
                onSelect={() => {
                  if (!transcriptOn) onToggleTranscript();
                }}
              />
            </div>
          )}
        </div>
      </header>
      {/* Suppressed while drilled (the subagent breadcrumb shows its own copy one level lower) AND
       *  while a live terminal is below: that's a bounded panel, not scrolling text, so it doesn't
       *  need the scroll-edge hint, and the header's own border-b already separates it cleanly.
       *  Rendering it there previously reintroduced App-theme color into a Terminal-themed area (see
       *  git history: 62e4401 and its follow-up both tried blending/recoloring this shadow for the
       *  terminal case before landing on simply not rendering it there at all). */}
      {!drilled && !terminalBelow && <ScrollHintShadow />}
    </>
  );
}

/** One segment of the header's view switcher: icon + label, `aria-pressed` for the active side.
 *  Active gets the control-active fill; inactive is quiet text that brightens on hover. Clicking
 *  the active segment is a no-op (the caller's `onSelect` guard). */
function ViewSegment({
  icon,
  label,
  active,
  onSelect,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cx(
        "flex h-4 items-center gap-1.5 rounded-xs px-2 text-[0.7rem] font-medium leading-none transition-colors duration-100",
        active
          ? "bg-(--ui-control-active-background) text-fg"
          : "text-(--ui-text-tertiary) hover:text-fg",
      )}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}
