import type { Management, SessionState } from "@shared/types";
import { BAR_MARK, BAR_SWEEP_DELAYS_MS, glyphTitle } from "./session-glyph";

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

/** The four-slot state mark (BAR_MARK, session-glyph.ts): pure CSS, no shared ticker. `sweep`
 *  animates each bar on its own clock via a staggered delay (the traveling peak); `animate` sits on
 *  the wrapper instead, so all four slots move together. The wrapper's fixed 11px height keeps
 *  every state on the same baseline inside the row's 14px (size-3.5) grid cell — ended's squeezed
 *  1px segments centre in it, so a state change causes no jitter. */
function StateBars({ mark }: { mark: (typeof BAR_MARK)[SessionState] }) {
  return (
    <span
      className={cx(
        "flex h-[11px] items-center justify-center gap-px",
        mark.animate,
        mark.dim,
      )}
    >
      {BAR_SWEEP_DELAYS_MS.map((delayMs) => (
        <span
          key={delayMs}
          className={cx(
            "w-0.5 rounded-[0.5px]",
            mark.height,
            mark.tone,
            mark.sweep && "animate-bar-sweep motion-reduce:animate-none",
          )}
          style={mark.sweep ? { animationDelay: `${delayMs}ms` } : undefined}
        />
      ))}
    </span>
  );
}

/** The session status glyph (2026-07-17 spec §4, unified on the bar mark 2026-07-21): every state
 *  is the same four-slot mark, differing only by color, motion, and height — see BAR_MARK.
 *  management is spoken only in the tooltip. */
export function Lamp({
  state,
  management,
}: {
  state: SessionState;
  management: Management;
}) {
  return (
    <span title={glyphTitle(state, management)}>
      <StateBars mark={BAR_MARK[state]} />
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
