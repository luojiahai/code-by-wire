import type { ReactNode } from "react";
import { cx } from "../ui/atoms";

/** Lamp + state-word tones for the System subsystem cards, matching the app's state hues:
 *  teal = live/healthy, amber = caution, red = hard fault, slate = indeterminate/off. */
export type LampTone = "live" | "warn" | "error" | "idle";

const LAMP: Record<LampTone, string> = {
  live: "bg-working shadow-[0_0_0.375rem_rgba(45,212,191,0.5)]",
  warn: "bg-accent shadow-[0_0_0.375rem_rgba(242,179,61,0.5)]",
  error: "bg-danger",
  idle: "bg-ink-600",
};

const WORD: Record<LampTone, string> = {
  live: "text-fg-muted",
  warn: "text-accent-bright",
  error: "text-danger",
  idle: "text-fg-faint",
};

/**
 * The subsystem card's header rail (design spec: "subsystem grammar"): state lamp, then the
 * annunciator state word in mono small-caps — the card's single statement of state — then the
 * primary action right-aligned. Renders inside Card, whose own title row carries the card name.
 */
export function SubsystemHeader({
  tone,
  word,
  action,
}: {
  tone: LampTone;
  word: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-ink-850 px-4 py-3">
      <span className={cx("h-2 w-2 rounded-full", LAMP[tone])} />
      <span className={cx("font-mono text-meta tracking-[0.14em]", WORD[tone])}>
        {word}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** A labelled readout row: faint label, mono value, optional inline-edit affordance, optional amber
 *  caveat line, optional expanded editor row rendered underneath (the inline override/interval inputs). */
export function ReadoutRow({
  label,
  value,
  warn,
  edit,
  expanded,
}: {
  label: string;
  value: ReactNode;
  warn?: string;
  edit?: ReactNode;
  expanded?: ReactNode;
}) {
  return (
    <div className="border-b border-ink-850 last:border-b-0">
      <div className="flex items-baseline gap-3 px-4 py-2.5 text-aux">
        <span className="w-20 shrink-0 text-fg-faint">{label}</span>
        <div className="min-w-0 flex-1">
          <div className="break-all font-mono text-fg-muted">{value}</div>
          {warn && (
            <div className="mt-1 text-meta text-accent-bright">{warn}</div>
          )}
        </div>
        {edit && <span className="shrink-0">{edit}</span>}
      </div>
      {expanded && <div className="px-4 pb-3">{expanded}</div>}
    </div>
  );
}

/** The fault band: appears only when a subsystem trips. Amber left rule, mono uppercase headline
 *  naming the fault, plain-language body (and remedy content), optional action button. Replaces the
 *  old always-on requirements checklist and the separate remedy block. */
export function FaultBand({
  headline,
  action,
  children,
}: {
  headline: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-ink-850 border-l-2 border-l-accent bg-accent/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-meta tracking-[0.1em] text-accent-bright">
          {headline}
        </div>
        <div className="mt-1 text-aux text-fg-muted">{children}</div>
      </div>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

/** The small bordered action button the header rail and fault band use (Recheck / Disable / Repair). */
export function RailButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-aux text-fg-muted transition-colors hover:border-ink-600 hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The dotted-underline inline-edit affordance on a readout row (Override / Edit). */
export function EditLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-dotted border-ink-600 text-meta text-fg-faint transition-colors hover:text-fg"
    >
      {children}
    </button>
  );
}
