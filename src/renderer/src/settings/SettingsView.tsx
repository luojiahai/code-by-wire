import type { CliStatus } from "@shared/cli-status";
import { isUpdatePending } from "@shared/update";
import { SoftwareUpdateCard, type UpdateControls } from "./SoftwareUpdateCard";
import { CliCard } from "./CliCard";
import { StatuslineCard } from "./StatuslineCard";
import { StatsDbCard } from "./StatsDbCard";
import { OverlayScroll } from "../ui/OverlayScroll";
import { Icon } from "../ui/icons";
import type { IconName } from "../ui/icon-names";
import { Wordmark, cx } from "../ui/atoms";
import { footerView } from "../ui/rail-footer";
import { PageHeader, Card } from "../shell/page-primitives";

export type SettingsSection = "system" | "about";

const NAV: { key: SettingsSection; label: string; icon: IconName }[] = [
  { key: "system", label: "System", icon: "monitor" },
  { key: "about", label: "About", icon: "info" },
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
  cliStatus: CliStatus | null;
  checking: boolean;
  onRecheck: () => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  update?: UpdateControls;
}) {
  const cliDot = footerView(cliStatus).dot;
  const cliTrips = cliDot === "warn" || cliDot === "error";
  const updatePending = update ? isUpdatePending(update.state.phase) : false;

  return (
    <div className="flex h-full min-w-0 flex-1 bg-ink-950 text-fg">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-ink-800 px-2 py-4">
        <div className="px-2.5 pb-2 font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
          Settings
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
              <span className="flex-1">{n.label}</span>
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
            // Remount System when kind changes, so a recheck can't leave the remedy's install-tab
            // default stale. A no-op recheck keeps the same kind, so the instance survives.
            <SystemSection
              key={cliStatus ? cliStatus.kind : "pending"}
              cliStatus={cliStatus}
              checking={checking}
              onRecheck={onRecheck}
            />
          )}
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
  cliStatus: CliStatus | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  return (
    <>
      <PageHeader
        title="System"
        lede="The machinery feeding this app. Keep it green."
      />
      <CliCard
        cliStatus={cliStatus}
        checking={checking}
        onRecheck={onRecheck}
      />
      <StatuslineCard />
      <StatsDbCard />
    </>
  );
}

function AboutSection({ update }: { update?: UpdateControls }) {
  return (
    <>
      <PageHeader title="About" />
      <Card title="Code-by-wire">
        <div className="flex flex-col gap-3 px-4 py-4">
          <Wordmark />
          <p className="max-w-[54ch] text-body leading-relaxed text-fg-muted">
            Pilot every Claude Code session, view its enriched transcript, and
            monitor the telemetry, in one interface.
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
