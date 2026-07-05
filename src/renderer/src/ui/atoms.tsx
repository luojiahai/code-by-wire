import type { Management, SessionState } from "@shared/types";
import { LAMP, glyphTitle } from "./session-glyph";

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

/** The session lamp (2026-07-04 spec §1): filled = live, hollow = quiet. Shape, size and motion come
 *  from the LAMP table; management is spoken only in the tooltip. Working layers a static core dot
 *  inside its spinning arc, so the outer span is the positioning context. */
export function Lamp({
  state,
  management,
}: {
  state: SessionState;
  management: Management;
}) {
  const lamp = LAMP[state];
  return (
    <span
      title={glyphTitle(state, management)}
      className={cx("relative inline-flex", lamp.outer)}
    >
      {lamp.core && <span className={lamp.core} />}
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
