import type { Management, SessionState } from "@shared/types";
import {
  glyphClass,
  glyphPulses,
  glyphTitle,
  glyphSpins,
  glyphTone,
  STATE_ICON,
} from "./session-glyph";
import { Icon } from "./icons";

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

/** The session ROW indicator: a compact monochrome state icon. Shape = state (via STATE_ICON), tone =
 *  management (managed muted, observed faint) — or brightened to fg when the row is selected. Working
 *  spins; Waiting carries a single static amber corner dot. Top-aligned so it sits with the title, not
 *  centered across both lines. Color lives in the group headers' Dot, never here. */
export function SessionTile({
  state,
  management,
  selected,
}: {
  state: SessionState;
  management: Management;
  selected?: boolean;
}) {
  return (
    <span
      title={glyphTitle(state, management)}
      className="relative mt-px flex h-4 w-4 shrink-0 items-center justify-center"
    >
      <Icon
        name={STATE_ICON[state]}
        size={15}
        className={cx(
          selected ? "text-fg" : glyphTone(management),
          glyphSpins(state) && "animate-spin",
        )}
      />
      {state === "waiting" && (
        <span className="absolute -right-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-accent ring-2 ring-ink-925" />
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

export function Wordmark() {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-2">
      <span className="font-brand text-xs font-semibold uppercase text-fg">
        Code-by-<span className="text-primary">wire</span>
      </span>
      {/* A quiet build badge: mono, faint, a notch smaller — it rides the brand, never competes. */}
      <span className="font-mono text-[11px] font-medium text-fg-faint">
        v{__APP_VERSION__}
      </span>
    </span>
  );
}
