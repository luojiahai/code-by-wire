import type { IndexDbInfo } from "@shared/ipc";
import { formatBytes } from "@shared/format";
import { Card } from "../shell/page-primitives";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import { DatabaseTables } from "./DatabaseTables";
import { ReadoutRow, SubsystemHeader } from "./system-primitives";

const SESSION_COLUMNS = [
  "id",
  "title",
  "project",
  "cwd",
  "branch",
  "state",
  "management",
  "agent",
  "model",
  "model_raw",
  "last_activity_ms",
  "created_ms",
  "awaiting_user",
  "transcript_mtime_ms",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "cache_creation_5m_tokens",
  "cache_creation_1h_tokens",
  "usage_by_model",
  "effort_level",
  "context_tokens",
  "compaction_count",
  "compaction_reclaimed_tokens",
] as const;

export function IndexDbCard({ info }: { info: IndexDbInfo | null }) {
  const { t } = useI18n();
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
    <Card title={t.settings.databases.index.title}>
      <SubsystemHeader
        tone={info ? "live" : "idle"}
        word={
          info
            ? t.settings.databases.index.live
            : t.settings.databases.index.stateChecking
        }
      />
      <div className="border-b border-ink-850 px-4 py-2.5 text-aux text-fg-muted">
        {t.settings.databases.index.sourceTruth}
      </div>
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
        label={t.settings.databases.sessionsIndexed}
        value={
          info
            ? t.settings.databases.agentCounts(
                info.sessions.total.toLocaleString("en-US"),
                info.sessions.byAgent.claude.toLocaleString("en-US"),
                info.sessions.byAgent.codex.toLocaleString("en-US"),
              )
            : "—"
        }
      />
      <DatabaseTables
        label={t.settings.databases.tables}
        tables={[
          {
            name: "sessions",
            rows: info?.sessions.total ?? null,
            purpose: t.settings.databases.index.sessionsPurpose,
            columns: SESSION_COLUMNS,
          },
        ]}
      />
    </Card>
  );
}
