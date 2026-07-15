import { useState } from "react";
import type { StatuslineStatus } from "@shared/statusline-status";
import { formatRelativeTime } from "@shared/format";
import { Card } from "../shell/page-primitives";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  EditLink,
  type LampTone,
} from "./system-primitives";
import { useStatuslineStatus } from "./use-statusline-status";

const WORD: Record<StatuslineStatus["state"], string> = {
  capturing: "CAPTURING",
  stale: "STALE",
  fault: "FAULT",
  off: "OFF",
};

const TONE: Record<StatuslineStatus["state"], LampTone> = {
  capturing: "live",
  stale: "warn",
  fault: "warn",
  off: "idle",
};

// Copy fixed by the design spec — do not reword.
const NOTE_ON =
  "Live duty, clock and rate limits reach the panels through Claude Code's statusline. Your own statusline renders as usual.";
const NOTE_OFF =
  "Capture is off: the panels fall back to transcript data — no live duty, clock or rate limits. Your statusline runs untouched.";

/**
 * The Statusline subsystem card (design spec "subsystem grammar"): whether the capture wrapper is
 * feeding the app, on the same header-rail/readout/fault-band anatomy as the CLI card. Owns its own
 * status poll — the readout is main-assembled and rendered verbatim; every decision (staleness,
 * coverage, fault text) was made in the shared derivation.
 */
export function StatuslineCard() {
  const { status, setEnabled, setRefreshInterval, repair } =
    useStatuslineStatus();

  if (status === null) {
    return (
      <Card title="Statusline">
        <SubsystemHeader tone="idle" word="CHECKING" />
      </Card>
    );
  }

  const on = status.state !== "off";
  const showRows = status.state === "capturing" || status.state === "stale";
  const note =
    status.state === "fault"
      ? null
      : status.state === "off"
        ? NOTE_OFF
        : NOTE_ON;
  return (
    <Card title="Statusline">
      <SubsystemHeader
        tone={TONE[status.state]}
        word={WORD[status.state]}
        action={
          <RailButton onClick={() => setEnabled(!on)}>
            {on ? "Disable" : "Enable"}
          </RailButton>
        }
      />

      {status.state === "stale" && (
        <FaultBand
          headline="NO FRESH CAPTURES"
          action={<RailButton onClick={repair}>Repair</RailButton>}
        >
          {status.watchedSessions} {status.watchKind}{" "}
          {status.watchedSessions === 1 ? "session" : "sessions"}, none
          reporting — captures have stopped. Repair rewrites the wrapper.
        </FaultBand>
      )}
      {status.state === "fault" && (
        <FaultBand
          headline="CAPTURE FAULT"
          action={<RailButton onClick={repair}>Repair</RailButton>}
        >
          {status.fault}
        </FaultBand>
      )}

      {showRows && (
        <>
          <RefreshRow
            value={status.refreshInterval}
            onSave={setRefreshInterval}
          />
          <ReadoutRow
            label="Last capture"
            value={
              status.lastCaptureMs === null
                ? "never"
                : formatRelativeTime(status.lastCaptureMs, Date.now())
            }
          />
          <ReadoutRow
            label="Sessions"
            value={
              status.watchedSessions === 0
                ? `no ${status.watchKind} sessions`
                : `${status.reportingSessions} of ${status.watchedSessions} ${status.watchKind} reporting`
            }
          />
        </>
      )}

      {note !== null && (
        <div className="px-4 py-2.5 text-meta leading-relaxed text-fg-faint">
          {note}
        </div>
      )}
    </Card>
  );
}

/** The Refresh readout with its inline editor: 1–60 s, or empty for events-only rendering. Without a
 *  timer Claude Code re-runs the statusline only on conversation events, so idle sessions go silent —
 *  the value here is what keeps the Duty/clock panels ticking between turns. */
function RefreshRow({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (seconds: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function save(): void {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSave(null);
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return; // keep editing; nothing sensible to save
      onSave(Math.min(60, Math.max(1, Math.round(n))));
    }
    setEditing(false);
  }

  return (
    <ReadoutRow
      label="Refresh"
      value={value === null ? "on events only" : `every ${value}s`}
      edit={
        <EditLink
          onClick={() => {
            setDraft(value === null ? "" : String(value));
            setEditing((v) => !v);
          }}
        >
          Edit
        </EditLink>
      }
      expanded={
        editing ? (
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="seconds (1–60), empty for events only"
              inputMode="numeric"
              className="w-56 rounded-md border border-ink-700 bg-field px-2.5 py-1.5 font-mono text-aux text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <RailButton onClick={save}>Save</RailButton>
            <RailButton onClick={() => setEditing(false)}>Cancel</RailButton>
          </div>
        ) : undefined
      }
    />
  );
}
