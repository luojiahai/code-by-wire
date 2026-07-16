import { useState } from "react";
import type { StatuslineStatus } from "@shared/statusline-status";
import { Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";
import type { Translations } from "../i18n";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  EditLink,
  type LampTone,
} from "./system-primitives";
import { useStatuslineStatus } from "./use-statusline-status";

const TONE: Record<StatuslineStatus["state"], LampTone> = {
  capturing: "live",
  stale: "warn",
  fault: "warn",
  off: "idle",
};

/** The annunciator word per state. Built inside the component (not module scope) so a locale switch
 *  re-resolves it; kept as a small function rather than an inline object for readability. */
function stateWord(state: StatuslineStatus["state"], t: Translations): string {
  switch (state) {
    case "capturing":
      return t.settings.statusline.stateCapturing;
    case "stale":
      return t.settings.statusline.stateStale;
    case "fault":
      return t.settings.statusline.stateFault;
    case "off":
      return t.settings.statusline.stateOff;
  }
}

/** The coverage-row population label ("live" sessions vs "working" sessions — see
 *  StatuslineStatus.watchKind). */
function watchKindLabel(
  kind: StatuslineStatus["watchKind"],
  t: Translations,
): string {
  return kind === "live"
    ? t.settings.statusline.watchKindLive
    : t.settings.statusline.watchKindWorking;
}

/**
 * The Statusline subsystem card (design spec "subsystem grammar"): whether the capture wrapper is
 * feeding the app, on the same header-rail/readout/fault-band anatomy as the CLI card. Owns its own
 * status poll — the readout is main-assembled and rendered verbatim; every decision (staleness,
 * coverage, fault text) was made in the shared derivation.
 */
export function StatuslineCard() {
  const { t } = useI18n();
  const { status, setEnabled, setRefreshInterval, repair } =
    useStatuslineStatus();

  if (status === null) {
    return (
      <Card title={t.settings.statusline.title}>
        <SubsystemHeader
          tone="idle"
          word={t.settings.statusline.stateChecking}
        />
      </Card>
    );
  }

  const on = status.state !== "off";
  const showRows = status.state === "capturing" || status.state === "stale";
  const note =
    status.state === "fault"
      ? null
      : status.state === "off"
        ? t.settings.statusline.noteOff
        : t.settings.statusline.noteOn;
  const watchKind = watchKindLabel(status.watchKind, t);
  return (
    <Card title={t.settings.statusline.title}>
      <SubsystemHeader
        tone={TONE[status.state]}
        word={stateWord(status.state, t)}
        action={
          <RailButton onClick={() => setEnabled(!on)}>
            {on ? t.settings.statusline.disable : t.settings.statusline.enable}
          </RailButton>
        }
      />

      {status.state === "stale" && (
        <FaultBand
          headline={t.settings.statusline.staleHeadline}
          action={
            <RailButton onClick={repair}>
              {t.settings.statusline.repair}
            </RailButton>
          }
        >
          {t.settings.statusline.staleBody(status.watchedSessions, watchKind)}
        </FaultBand>
      )}
      {status.state === "fault" && (
        <FaultBand
          headline={t.settings.statusline.faultHeadline}
          action={
            <RailButton onClick={repair}>
              {t.settings.statusline.repair}
            </RailButton>
          }
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
            label={t.settings.statusline.lastCapture}
            value={
              status.lastCaptureMs === null
                ? t.settings.statusline.never
                : t.time.ago(status.lastCaptureMs, Date.now())
            }
          />
          <ReadoutRow
            label={t.settings.statusline.sessions}
            value={
              status.watchedSessions === 0
                ? t.settings.statusline.noSessions(watchKind)
                : t.settings.statusline.sessionsReporting(
                    status.reportingSessions,
                    status.watchedSessions,
                    watchKind,
                  )
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
  const { t } = useI18n();
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
      label={t.settings.statusline.refresh}
      value={
        value === null
          ? t.settings.statusline.eventsOnly
          : t.settings.statusline.every(value)
      }
      edit={
        <EditLink
          onClick={() => {
            setDraft(value === null ? "" : String(value));
            setEditing((v) => !v);
          }}
        >
          {t.settings.statusline.edit}
        </EditLink>
      }
      expanded={
        editing ? (
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.settings.statusline.refreshPlaceholder}
              inputMode="numeric"
              className="w-56 rounded-md border border-ink-700 bg-well px-2.5 py-1.5 font-mono text-aux text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <RailButton onClick={save}>{t.settings.statusline.save}</RailButton>
            <RailButton onClick={() => setEditing(false)}>
              {t.common.cancel}
            </RailButton>
          </div>
        ) : undefined
      }
    />
  );
}
