import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { formatClock } from "@shared/format";
import { modelLabel, STATE_META } from "../ui/meta";
import { MODE_INFO } from "./mode-info";
import { Cell } from "./Cell";
import { GitCell } from "./GitCell";

/**
 * The workspace header's instrument strip — the cockpit's annunciator. Two status lamps (State, Link)
 * carry live LEDs, then a seam, then the identity readouts (Model · Effort, Git, Clock). The Git cell is
 * a minimal branch readout with a detail popover (repo link, copy-able branch and commit, PR link,
 * sync/diff/status numbers). Context and spend deliberately stay out: they live in the telemetry sidebar.
 * Color appears only on the state lamps and the one amber PR link, where it marks an action.
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
    { known: managed },
  );
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
      <Cell
        label="Model · Effort"
        grow={2}
        seam
        raw
        title={s.effortLevel ? `${model} · ${s.effortLevel}` : model}
      >
        <span className="min-w-0 truncate">
          {model}
          {s.effortLevel && <span className="text-fg"> · {s.effortLevel}</span>}
        </span>
      </Cell>
      <GitCell session={s} git={git} pr={pr} />
      <Cell label="Clock">{clock ?? "—"}</Cell>
    </div>
  );
}
