import { useState } from "react";
import { useStore } from "@nanostores/react";
import type { AnalyticsDbInfo, AgentCounts } from "@shared/ipc";
import { formatBytes } from "@shared/format";
import { localDayKey } from "@shared/stats";
import { Card } from "../shell/page-primitives";
import { Icon } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useI18n } from "../i18n";
import { $scanProgress, kickStatsPump } from "../stats/use-stats-pump";
import { DatabaseTables } from "./DatabaseTables";
import {
  ReadoutRow,
  SubsystemHeader,
  type LampTone,
} from "./system-primitives";

const SHOW_ANALYTICS_RESET = false;

const TURN_COLUMNS = [
  "message_id",
  "session_id",
  "agent",
  "ts",
  "model_raw",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "cache_creation_5m_tokens",
  "cache_creation_1h_tokens",
  "cwd",
  "project",
  "branch",
] as const;

function countValue(
  counts: AgentCounts,
  render: (total: string, claude: string, codex: string) => string,
): string {
  return render(
    counts.total.toLocaleString("en-US"),
    counts.byAgent.claude.toLocaleString("en-US"),
    counts.byAgent.codex.toLocaleString("en-US"),
  );
}

export function AnalyticsDbCard({ info }: { info: AnalyticsDbInfo | null }) {
  const { t } = useI18n();
  const progress = useStore($scanProgress);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState(false);
  const backfilling = progress !== null && !progress.done;
  const tone: LampTone =
    progress === null ? "idle" : backfilling ? "warn" : "live";
  const word =
    progress === null
      ? t.settings.databases.analytics.stateChecking
      : backfilling
        ? t.settings.databases.analytics.backfilling(
            progress.filesDone,
            progress.filesTotal,
          )
        : t.settings.databases.analytics.mirrored;

  async function handleReset(): Promise<void> {
    setConfirmReset(false);
    try {
      const result = await window.api.resetAnalytics();
      setResetError(!result.ok);
      if (result.ok) {
        $scanProgress.set({ filesTotal: 0, filesDone: 0, done: false });
        kickStatsPump();
      }
    } catch {
      setResetError(true);
    }
  }

  const reveal = info ? (
    <button
      type="button"
      onClick={() => void window.api.revealPath(info.path)}
      title={t.settings.databases.reveal}
      aria-label={t.settings.databases.reveal}
      className="text-fg-faint transition-colors hover:text-fg"
    >
      <Icon name="folder-open" size={13} />
    </button>
  ) : undefined;

  return (
    <Card title={t.settings.databases.analytics.title}>
      <SubsystemHeader tone={tone} word={word} />
      <ReadoutRow
        label={t.settings.databases.location}
        value={info?.path ?? "—"}
        edit={reveal}
      />
      <ReadoutRow
        label={t.settings.databases.size}
        value={info ? formatBytes(info.sizeBytes) : "—"}
      />
      <ReadoutRow
        label={t.settings.databases.turns}
        value={
          info ? countValue(info.turns, t.settings.databases.agentCounts) : "—"
        }
      />
      <ReadoutRow
        label={t.settings.databases.sessions}
        value={
          info
            ? countValue(info.sessions, t.settings.databases.agentCounts)
            : "—"
        }
      />
      <ReadoutRow
        label={t.settings.databases.history}
        value={
          info?.oldestTs != null
            ? t.settings.databases.since(localDayKey(info.oldestTs))
            : "—"
        }
      />
      <DatabaseTables
        label={t.settings.databases.tables}
        tables={[
          {
            name: "turns",
            rows: info?.turns.total ?? null,
            purpose: t.settings.databases.analytics.turnsPurpose,
            columns: TURN_COLUMNS,
          },
          {
            name: "processed_files",
            rows: info?.processedFiles ?? null,
            purpose: t.settings.databases.analytics.processedFilesPurpose,
            columns: ["path", "mtime", "lines"],
          },
          {
            name: "worktrees",
            rows: info?.worktrees ?? null,
            purpose: t.settings.databases.analytics.worktreesPurpose,
            columns: ["cwd", "repo_root", "worktree_name"],
          },
        ]}
      />
      {SHOW_ANALYTICS_RESET && (
        <>
          <div className="flex items-center gap-3 bg-danger/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-meta tracking-[0.1em] text-danger">
                {t.settings.databases.analytics.dangerHeadline}
              </div>
              <div className="mt-1 text-aux text-fg-muted">
                {t.settings.databases.analytics.dangerBody}
              </div>
              {resetError && (
                <div className="mt-1 text-meta text-danger">
                  {t.settings.databases.analytics.resetError}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setResetError(false);
                setConfirmReset(true);
              }}
              disabled={backfilling}
              className="inline-flex shrink-0 items-center rounded-md border border-danger/40 px-2.5 py-1 text-aux text-danger transition-colors hover:border-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.settings.databases.analytics.reset}
            </button>
          </div>
          {confirmReset && (
            <ConfirmDialog
              title={t.settings.databases.analytics.confirmTitle}
              body={t.settings.databases.analytics.confirmBody}
              confirmLabel={t.settings.databases.analytics.reset}
              cancelLabel={t.common.cancel}
              tone="danger"
              onCancel={() => setConfirmReset(false)}
              onConfirm={() => void handleReset()}
            />
          )}
        </>
      )}
    </Card>
  );
}
