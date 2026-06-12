import { useId } from "react";
import type { Management, SessionState } from "@shared/types";
import { glyphClass, glyphPulses, glyphTitle } from "./session-glyph";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The session glyph: color = state, fill = management. Pass `management` for a session dot (filled when
 *  managed, hollow ring when observed, with a "state · management" tooltip); omit it for the state-group
 *  headers, which are about state alone and stay filled. */
export function Dot({
  state,
  management,
}: {
  state: SessionState;
  management?: Management;
}) {
  const cls = glyphClass(state, management ?? "managed");
  return (
    <span
      title={management ? glyphTitle(state, management) : undefined}
      className={cx("relative inline-flex h-2 w-2 rounded-full", cls)}
    >
      {glyphPulses(state) && (
        <span
          className={cx(
            "absolute inset-0 rounded-full",
            cls,
            "animate-pulse-soft",
          )}
        />
      )}
    </span>
  );
}

/** A small colored square that keys a legend row to its diagram segment. `color` is any CSS color
 *  string (a token var, a color-mix). Shared by the cost/token legends so the key never drifts. */
export function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-[2px]"
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

/** The brand mark: the node–wire–node monogram (teal node · sky wire · amber node) plus the wordmark
 *  with "wire" in the sky accent. The mark is the design-system app icon (build/icon.svg) rendered
 *  inline, sans its rounded tile frame — same gradients, no box. */
function LogoMark() {
  // Colors come from the theme tokens, not hex literals, so the mark tracks the palette with the rest
  // of the UI (the wire bar shares `primary` with the "wire" text below). Gradient ids are scoped per
  // instance so a second mark on the page can't collide on a global id.
  const uid = useId();
  const teal = `${uid}-teal`;
  const amber = `${uid}-amber`;
  return (
    <svg
      viewBox="285 425 454 174"
      className="h-[8px] w-auto shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={teal} cx="0.35" cy="0.3" r="0.8">
          <stop
            offset="0"
            style={{ stopColor: "var(--color-working-bright)" }}
          />
          <stop offset="1" style={{ stopColor: "var(--color-working)" }} />
        </radialGradient>
        <radialGradient id={amber} cx="0.35" cy="0.3" r="0.8">
          <stop
            offset="0"
            style={{ stopColor: "var(--color-accent-bright)" }}
          />
          <stop offset="1" style={{ stopColor: "var(--color-accent)" }} />
        </radialGradient>
      </defs>
      <rect
        x="372"
        y="497"
        width="280"
        height="30"
        rx="15"
        className="fill-primary"
      />
      <circle
        cx="372"
        cy="512"
        r="82"
        fill={`url(#${teal})`}
        className="stroke-working"
        strokeWidth="2"
        strokeOpacity={0.45}
      />
      <circle
        cx="652"
        cy="512"
        r="82"
        fill={`url(#${amber})`}
        className="stroke-accent"
        strokeWidth="2"
        strokeOpacity={0.5}
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
        code-by-<span className="text-primary">wire</span>
      </span>
    </div>
  );
}
