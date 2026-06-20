import { useState, type ReactNode } from "react";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { formatClock } from "@shared/format";
import { cx } from "../ui/atoms";
import { modelLabel, STATE_META } from "../ui/meta";
import { MODE_INFO } from "./mode-info";

/**
 * The workspace header's instrument strip — the cockpit's annunciator. Two status lamps (State, Link)
 * carry live LEDs, then a seam, then the identity readouts (Model · Effort, Git, Clock). The Git cell is
 * identity only — `repo · branch · PR #n`; the diff/sync numbers live in its hover tooltip. Context and
 * spend deliberately stay out: they live in the telemetry sidebar. Color appears only on the state lamps
 * and the one amber PR link, where it marks an action.
 */
export function Annunciator({
  session: s,
  git,
  pr,
}: {
  session: Session;
  git?: GitInfo | null;
  pr?: PrInfo | null;
}) {
  const state = STATE_META[s.state];
  const pulses = s.state === "working" || s.state === "waiting";
  const managed = s.management === "managed";
  const mode = MODE_INFO[s.management];
  const model = modelLabel(
    s.model,
    s.modelId ?? s.modelRaw,
    s.modelDisplayName,
    { compact: true, known: managed },
  );
  const repo = s.project;
  const branch = git?.branch ?? s.branch;
  const ident = branch ? `${repo} · ${branch}` : repo;
  const clock = s.sessionClockMs != null ? formatClock(s.sessionClockMs) : null;
  return (
    <div className="mt-2 flex items-stretch overflow-hidden rounded-md border border-ink-800 bg-well shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
      <Cell
        label="State"
        led={state.dot}
        ledPulse={pulses}
        valueClass={state.text}
      >
        {state.label}
      </Cell>
      <Cell
        label="Link"
        led={managed ? "bg-primary" : "bg-idle"}
        valueClass={managed ? "text-primary" : "text-fg-muted"}
        title={mode.blurb}
      >
        {mode.label}
      </Cell>
      <Cell label="Model · Effort" grow={1.5} seam>
        {model}
        {s.effortLevel && <span className="text-fg"> · {s.effortLevel}</span>}
      </Cell>
      <Cell label="Git" grow={2.4} raw tooltip={git ? gitTip(git) : undefined}>
        <span className="flex min-w-0 items-center">
          <span className="min-w-0 truncate text-fg">{ident}</span>
          {pr ? (
            <span className="shrink-0 whitespace-nowrap text-fg-muted">
              {" · PR "}
              <button
                type="button"
                onClick={() => {
                  void window.api.openExternal(pr.url);
                }}
                className="text-accent underline underline-offset-2 hover:text-accent-bright"
              >
                #{pr.number}
              </button>
            </span>
          ) : null}
        </span>
      </Cell>
      <Cell label="Clock">{clock ?? "—"}</Cell>
    </div>
  );
}

/** The Git cell's hover readout: the demoted git numbers. Ahead/behind (monochrome) only when there's an
 *  upstream; insert (green) / delete (red) always. */
function gitTip(git: GitInfo): ReactNode {
  const sync =
    git.ahead != null && git.behind != null ? (
      <>
        <span className="text-fg">↑{git.ahead}</span>{" "}
        <span className="text-fg-muted">↓{git.behind}</span>
        {" · "}
      </>
    ) : null;
  return (
    <span className="font-mono">
      {sync}
      <span className="text-ok">+{git.insertions}</span>{" "}
      <span className="text-danger">−{git.deletions}</span>
    </span>
  );
}

/** One annunciator cell: a Saira placard label over a mono readout. `led` adds a status lamp before the
 *  value (pulsing for live states); `seam` draws the divider between the status lamps and the readouts.
 *  `tooltip` shows a custom hover popover (for color the native `title` can't carry); `raw` drops the
 *  default value wrapper so the cell lays out its own value (the Git cell truncates its identity and pins
 *  its PR). */
function Cell({
  label,
  led,
  ledPulse,
  valueClass,
  grow,
  seam,
  raw,
  tooltip,
  title,
  children,
}: {
  label: string;
  led?: string;
  ledPulse?: boolean;
  valueClass?: string;
  grow?: number;
  seam?: boolean;
  raw?: boolean;
  tooltip?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      title={tooltip ? undefined : title}
      onMouseEnter={tooltip ? () => setHover(true) : undefined}
      onMouseLeave={tooltip ? () => setHover(false) : undefined}
      style={{ flex: grow ?? 1 }}
      className={cx(
        "relative flex min-w-0 flex-col gap-[3px] border-r border-ink-850 px-3 py-1.5 last:border-r-0",
        seam && "border-l border-ink-800",
      )}
    >
      <span className="font-display text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
        {label}
      </span>
      <span
        className={cx(
          "flex min-w-0 items-center gap-1.5 font-mono text-[12px]",
          valueClass ?? "text-fg",
        )}
      >
        {led && (
          <span
            className={cx(
              "h-[7px] w-[7px] shrink-0 rounded-full",
              led,
              ledPulse && "animate-pulse-soft",
            )}
          />
        )}
        {raw ? children : <span className="min-w-0">{children}</span>}
      </span>
      {tooltip && hover && (
        <div className="pointer-events-none absolute left-2 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-[11px] shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  );
}
