import type { Management, SessionState } from "@shared/types";
import {
  GLYPH,
  glyphTitle,
  WORKING_BAR_DELAYS_MS,
  WORKING_BAR_TONE,
} from "./session-glyph";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Hermes parity: the desktop chrome carries NO focus rings (hermes kills native outlines and
 *  Tailwind ring vars globally — DESIGN.md "no focus rings anywhere"). The global
 *  `:focus-visible { outline: none }` in index.css already suppresses the platform ring; these
 *  exports are retained as no-ops so out-of-scope call sites keep compiling. Known keyboard-a11y
 *  tradeoff, accepted in the 2026-07-02 style-parity spec. */
export const focusRing = "";
export const focusRingInset = "";

/** The working glyph: 4 bars sweeping left-to-right-to-left (pure CSS, animate-bar-sweep in
 *  index.css — no shared ticker, each bar just runs the same keyframe on its own clock, offset by
 *  WORKING_BAR_DELAYS_MS). Sized to fit the row's 14px (size-3.5) grid cell alongside the other
 *  three states' single characters. */
function WorkingBars() {
  return (
    <span className="flex h-[11px] items-center justify-center gap-px">
      {WORKING_BAR_DELAYS_MS.map((delayMs) => (
        <span
          key={delayMs}
          className={cx(
            "h-2.5 w-0.5 rounded-[0.5px] animate-bar-sweep motion-reduce:animate-none",
            WORKING_BAR_TONE,
          )}
          style={{ animationDelay: `${delayMs}ms` }}
        />
      ))}
    </span>
  );
}

/** The session status glyph (2026-07-17 spec §4, working redesigned same day): working renders as
 *  WorkingBars (4 sweeping bars); the other three states render a mono character from the GLYPH
 *  table, color as the second signal. management is spoken only in the tooltip. font-mono is
 *  load-bearing for the character states so their advance width stays fixed. Renders inside the
 *  rows' 14px (size-3.5) grid cell. */
export function Lamp({
  state,
  management,
}: {
  state: SessionState;
  management: Management;
}) {
  const title = glyphTitle(state, management);
  if (state === "working") {
    return (
      <span title={title}>
        <WorkingBars />
      </span>
    );
  }
  const glyph = GLYPH[state];
  return (
    <span
      title={title}
      className={cx(
        "font-mono text-[0.75rem] font-semibold leading-none",
        glyph.tone,
        glyph.animate,
      )}
    >
      {glyph.char}
    </span>
  );
}

/** A small colored square that keys a legend row to its diagram segment. `color` is any CSS color
 *  string (a token var, a color-mix). Shared by the cost/token legends so the key never drifts. */
export function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-xs"
      style={{ background: color }}
    />
  );
}

/** A thin progress bar. `fill` is a Tailwind bg class; the track is fixed `bg-ink-850`. The caller
 *  sizes it via `className` (e.g. `w-16`). No width transition: the list re-syncs every few seconds
 *  and animating every bar reads as noise. */
export function Bar({
  pct,
  fill,
  className,
}: {
  pct: number;
  fill: string;
  className?: string;
}) {
  return (
    <div
      className={cx("h-1.5 overflow-hidden rounded-full bg-ink-850", className)}
    >
      <div
        className={cx("h-full rounded-full", fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/** A 16px gradient pulled up over whatever sits below it via negative margin, hinting there's
 *  scrollable content under a sticky header-like bar. Shared by `MiddleHeader` and the subagent-drill
 *  breadcrumb — each shows at most one at a time — so the two copies can't visually drift apart. */
export function ScrollHintShadow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-10 -mb-4 h-4 shrink-0 bg-linear-to-b from-(--ui-chat-surface-background) to-transparent"
    />
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span className="inline-flex items-center gap-1.5 font-display text-aux font-semibold uppercase text-fg">
        <span
          aria-hidden
          className="font-mono text-[9px] leading-none -translate-y-px"
        >
          ░▒▓█
        </span>
        <span>
          Code-by-<span className="text-primary">wire</span>
        </span>
      </span>
      {/* A quiet build badge: mono, faint, a notch smaller — it rides the brand, never competes. */}
      <span className="font-mono text-meta font-medium text-fg-faint">
        v{__APP_VERSION__}
      </span>
    </span>
  );
}
