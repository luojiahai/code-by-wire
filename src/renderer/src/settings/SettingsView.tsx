import { useEffect, useState } from "react";
import type { CliStatusByAgent } from "@shared/cli-status";
import type { DbInfo } from "@shared/ipc";
import { AGENT_IDS, AGENTS, type AgentId } from "@shared/agents";
import { isUpdatePending } from "@shared/update";
import { SoftwareUpdateCard, type UpdateControls } from "./SoftwareUpdateCard";
import { AppearanceCard } from "./AppearanceCard";
import { CliCard } from "./CliCard";
import { CodexCliCard } from "./CodexCliCard";
import { StatuslineCard } from "./StatuslineCard";
import { AnalyticsDbCard } from "./AnalyticsDbCard";
import { IndexDbCard } from "./IndexDbCard";
import { AgentIcon } from "../ui/agent-icons";
import { OverlayScroll } from "../ui/OverlayScroll";
import { Icon } from "../ui/icons";
import type { IconName } from "../ui/icon-names";
import { Wordmark, cx } from "../ui/atoms";
import { footerView } from "../ui/rail-footer";
import { PageHeader, Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";

export type SettingsSection = "system" | "appearance" | "databases" | "about";

const NAV: { key: SettingsSection; icon: IconName }[] = [
  { key: "system", icon: "monitor" },
  { key: "appearance", icon: "palette" },
  { key: "databases", icon: "database" },
  { key: "about", icon: "info" },
];

/**
 * The Settings view: a full Workspace-pane view (like the Overview) reached from the title-bar gear. A left
 * sub-nav switches between System (CLI/engine health) and About.
 * The Sys lamp and the title-bar gear both route here; System is the new home for the Claude Code CLI
 * status (it replaced the standalone modal), so the remedy commands live in it too.
 */
export function SettingsView({
  cliStatus,
  checking,
  onRecheck,
  section,
  onSectionChange,
  update,
}: {
  cliStatus: CliStatusByAgent;
  checking: AgentId | null;
  onRecheck: (agent: AgentId) => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  update?: UpdateControls;
}) {
  const { t } = useI18n();
  // The nav dot always reads Claude's status specifically — it's the sidebar's summary lamp, and
  // Claude is the agent every session can spawn.
  const cliDot = footerView(cliStatus.claude ?? null).dot;
  const cliTrips = cliDot === "warn" || cliDot === "error";
  const updatePending = update ? isUpdatePending(update.state.phase) : false;

  return (
    <div className="flex h-full min-w-0 flex-1 bg-ink-950 text-fg">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-ink-800 px-2 py-4">
        <div className="px-2.5 pb-2 font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
          {t.settings.nav.settings}
        </div>
        {NAV.map((n) => {
          const active = section === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => onSectionChange(n.key)}
              className={cx(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-body transition-colors",
                active
                  ? "bg-ink-900 text-fg"
                  : "text-fg-muted hover:bg-ink-900/50 hover:text-fg",
              )}
            >
              <Icon
                name={n.icon}
                size={15}
                className="shrink-0 text-fg-faint"
              />
              <span className="flex-1">{t.settings.nav[n.key]}</span>
              {n.key === "system" && cliTrips && (
                <span
                  className={cx(
                    "h-1.5 w-1.5 rounded-full",
                    cliDot === "error" ? "bg-danger" : "bg-accent",
                  )}
                />
              )}
              {n.key === "about" && updatePending && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </nav>

      <OverlayScroll className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-[640px] flex-col gap-5 px-8 py-7">
          {section === "system" && (
            <SystemSection
              cliStatus={cliStatus}
              checking={checking}
              onRecheck={onRecheck}
            />
          )}
          {section === "appearance" && (
            <>
              <PageHeader
                title={t.settings.appearance.title}
                lede={t.settings.appearance.lede}
              />
              <AppearanceCard />
            </>
          )}
          {section === "databases" && <DatabasesSection />}
          {section === "about" && <AboutSection update={update} />}
        </div>
      </OverlayScroll>
    </div>
  );
}

function SystemSection({
  cliStatus,
  checking,
  onRecheck,
}: {
  cliStatus: CliStatusByAgent;
  checking: AgentId | null;
  onRecheck: (agent: AgentId) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t.settings.system.title}
        lede={t.settings.system.lede}
      />
      {AGENT_IDS.map((id) => (
        <div key={id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AgentIcon agent={id} size={15} />
            <span className="font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
              {AGENTS[id].label}
            </span>
          </div>
          {id === "claude" ? (
            <>
              {/* Remount just this card (not the whole section) when Claude's kind changes, so a
               *  recheck can't leave the remedy's install-tab default stale. A no-op recheck keeps
               *  the same kind, so the instance survives. */}
              <CliCard
                key={cliStatus.claude?.kind ?? "pending"}
                cliStatus={cliStatus.claude ?? null}
                checking={checking === "claude"}
                onRecheck={() => onRecheck("claude")}
              />
              <StatuslineCard />
            </>
          ) : (
            <CodexCliCard
              status={cliStatus.codex ?? null}
              checking={checking === "codex"}
              onRecheck={() => onRecheck("codex")}
            />
          )}
        </div>
      ))}
    </>
  );
}

function DatabasesSection() {
  const { t } = useI18n();
  const [info, setInfo] = useState<DbInfo | null>(null);
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function tick(): Promise<void> {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await window.api.dbInfo();
        if (alive) setInfo(next);
      } catch {
        // Main never rejects; a torn bridge keeps the last good readout.
      } finally {
        inFlight = false;
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <PageHeader
        title={t.settings.databases.title}
        lede={t.settings.databases.lede}
      />
      <AnalyticsDbCard info={info?.analytics ?? null} />
      <IndexDbCard info={info?.index ?? null} />
    </>
  );
}

function AboutSection({ update }: { update?: UpdateControls }) {
  const { t } = useI18n();
  const autoCheckReady = update?.autoCheckReady;
  const maybeAutoCheck = update?.maybeAutoCheck;
  useEffect(() => {
    if (autoCheckReady) maybeAutoCheck?.();
  }, [autoCheckReady, maybeAutoCheck]);

  return (
    <>
      <PageHeader title={t.settings.about.title} />
      <Card title="Code-by-wire">
        <div className="flex flex-col gap-3 px-4 py-4">
          <Wordmark />
          <p className="max-w-[54ch] text-body leading-relaxed text-fg-muted">
            {t.settings.about.tagline}
          </p>
          <button
            type="button"
            onClick={() =>
              void window.api.openExternal(
                "https://github.com/luojiahai/code-by-wire",
              )
            }
            className="inline-flex w-fit items-center gap-1.5 font-mono text-meta text-fg-faint transition-colors hover:text-primary"
          >
            <Icon name="github" size={12} />
            github.com/luojiahai/code-by-wire
          </button>
        </div>
      </Card>
      {update && <SoftwareUpdateCard update={update} />}
    </>
  );
}
