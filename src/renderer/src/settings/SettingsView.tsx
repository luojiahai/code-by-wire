import { useState, type ReactNode } from "react";
import type { CliStatus } from "@shared/cli-status";
import type { Account, RateLimit } from "@shared/types";
import { formatResetCountdown } from "@shared/format";
import { SoftwareUpdateCard, type UpdateControls } from "./SoftwareUpdateCard";
import { OverlayScroll } from "../ui/OverlayScroll";
import { Icon } from "../ui/icons";
import type { IconName } from "../ui/icon-names";
import { Wordmark, cx } from "../ui/atoms";
import { footerView, type FooterView } from "../ui/rail-footer";
import { cliStatusView } from "../ui/cli-status-view";
import { RateBar } from "../ui/charts";
import { ctxColor } from "../ui/meta";
import { clampPct } from "../ui/charts-geom";
import { remediesFor, INSTALL_TABS } from "../ui/cli-remedies";

export type SettingsSection = "system" | "account" | "appearance" | "about";

const NAV: { key: SettingsSection; label: string; icon: IconName }[] = [
  { key: "system", label: "System", icon: "monitor" },
  { key: "account", label: "Account", icon: "circle-user" },
  { key: "appearance", label: "Appearance", icon: "palette" },
  { key: "about", label: "About", icon: "info" },
];

// Lamp dot tone, mirroring the title-bar Sys lamp (GlobalHeader): green ok, amber warn, red error, slate
// pre-check. One source of truth would be nicer; kept local until the Sys-lamp rewire folds them together.
const DOT_CLASS: Record<FooterView["dot"], string> = {
  ok: "bg-working",
  warn: "bg-accent",
  error: "bg-danger",
  idle: "bg-ink-600",
};

/**
 * The Settings view: a full Workspace-pane view (like the Overview) reached from the title-bar gear. A left
 * sub-nav switches between System (CLI/engine health), Account (identity + limits), Appearance, and About.
 * The Sys lamp and the title-bar gear both route here; System is the new home for the Claude Code CLI
 * status (it replaced the standalone modal), so the binary override and remedy commands live in it too.
 */
export function SettingsView({
  cliStatus,
  account,
  checking,
  onRecheck,
  onSetBinPath,
  section,
  onSectionChange,
  update,
}: {
  cliStatus: CliStatus | null;
  account: Account | null;
  checking: boolean;
  onRecheck: () => void;
  onSetBinPath: (path: string | null) => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  update?: UpdateControls;
}) {
  const cliDot = footerView(cliStatus).dot;
  const cliTrips = cliDot === "warn" || cliDot === "error";

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
            </button>
          );
        })}
      </nav>

      <OverlayScroll className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-[640px] flex-col gap-5 px-8 py-7">
          {section === "system" && (
            // Remount System when the values its useState initializers read change, so a recheck can't
            // leave the remedy's install-tab default or the binary-override prefill stale. kind +
            // installMethod pick the default tab; source + path prefill the override. A no-op recheck
            // keeps the same tuple, so the instance (and any typed path) survives. Mirrors the keying the
            // old CliStatusModal carried before this view absorbed it.
            <SystemSection
              key={
                cliStatus
                  ? `${cliStatus.kind}:${cliStatus.installMethod}:${cliStatus.source}:${cliStatus.path ?? ""}`
                  : "pending"
              }
              cliStatus={cliStatus}
              checking={checking}
              onRecheck={onRecheck}
              onSetBinPath={onSetBinPath}
            />
          )}
          {section === "account" && <AccountSection account={account} />}
          {section === "appearance" && <AppearanceSection />}
          {section === "about" && <AboutSection update={update} />}
        </div>
      </OverlayScroll>
    </div>
  );
}

function Header({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-heading font-semibold tracking-tight text-fg">
        {title}
      </h1>
      {lede && (
        <p className="max-w-[54ch] text-body leading-relaxed text-fg-muted">
          {lede}
        </p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-925">
      <div className="border-b border-ink-850 px-4 py-2.5 font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-850 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-body text-fg">{label}</div>
        {desc && <div className="mt-0.5 text-meta text-fg-faint">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A muted, bordered "locked"/status pill. */
function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-ink-700 px-2 py-0.5 font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
      {children}
    </span>
  );
}

function SystemSection({
  cliStatus,
  checking,
  onRecheck,
  onSetBinPath,
}: {
  cliStatus: CliStatus | null;
  checking: boolean;
  onRecheck: () => void;
  onSetBinPath: (path: string | null) => void;
}) {
  const view = cliStatus ? cliStatusView(cliStatus) : null;
  const tone: FooterView["dot"] = view?.tone ?? "idle";
  return (
    <>
      <Header
        title="System"
        lede="Code-by-wire reads sessions through the Claude Code CLI and your local transcripts. This is the engine. Keep it green."
      />
      <Card title="Claude Code CLI">
        <div className="flex items-start gap-3 border-b border-ink-850 px-4 py-3.5">
          <span
            className={cx("mt-1 h-2.5 w-2.5 rounded-full", DOT_CLASS[tone])}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium text-fg">
                {view ? view.headline : "Checking…"}
              </span>
              {cliStatus?.version && (
                <span className="font-mono text-meta text-fg-muted">
                  v{cliStatus.version}
                </span>
              )}
            </div>
            {view && (
              <div className="mt-0.5 text-meta text-fg-muted">
                {view.detail}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onRecheck}
            disabled={checking || cliStatus === null}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-aux text-fg-muted transition-colors hover:border-ink-600 hover:text-fg disabled:opacity-40"
          >
            <Icon
              name="rotate-ccw"
              size={13}
              className={checking ? "animate-spin" : ""}
            />
            Recheck
          </button>
        </div>

        {cliStatus && cliStatus.kind !== "ready" && (
          <div className="border-b border-ink-850 px-4 py-3">
            <Remedy status={cliStatus} />
          </div>
        )}

        <DetailRow
          label="Version"
          value={cliStatus?.version ? `v${cliStatus.version}` : "not detected"}
        />
        <DetailRow
          label="Binary"
          value={cliStatus?.path ?? "no binary resolved"}
          warn={
            cliStatus && cliStatus.duplicates.length > 1
              ? "Multiple claude installs found; the app uses the first."
              : undefined
          }
        />
        <DetailRow
          label="Config"
          value={cliStatus?.configDir.active ?? "~/.claude"}
          warn={
            cliStatus?.configDir.mismatch
              ? `The CLI uses ${cliStatus.configDir.recovered}; restart after fixing.`
              : undefined
          }
        />

        <div className="flex flex-col gap-2 px-4 py-3.5">
          {requirementsFor(cliStatus).map((r) => (
            <Req key={r.label} state={r.state} label={r.label} />
          ))}
        </div>
      </Card>

      <BinaryOverride
        cliStatus={cliStatus}
        checking={checking}
        onSetBinPath={onSetBinPath}
      />
    </>
  );
}

/** The remedy block for a non-ready CLI: install tabs, an update/verify command, or login guidance, plus
 *  a docs link. Ported from the old CLI status modal so a tripped CLI can be fixed without it. */
function Remedy({ status }: { status: CliStatus }) {
  const remedy = remediesFor({
    kind: status.kind,
    installMethod: status.installMethod,
  });
  const [tab, setTab] = useState(remedy.defaultTab ?? "native");
  const activeInstall = INSTALL_TABS.find((t) => t.method === tab);
  return (
    <div className="flex flex-col gap-2.5">
      {remedy.section === "install" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {INSTALL_TABS.map((t) => (
              <button
                key={t.method}
                type="button"
                onClick={() => setTab(t.method)}
                className={cx(
                  "rounded-md px-2 py-1 text-aux transition-colors",
                  tab === t.method
                    ? "bg-ink-700 text-fg"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {activeInstall && (
            <CommandRow cmd={activeInstall.command} note={activeInstall.note} />
          )}
        </div>
      )}
      {remedy.section === "update" && remedy.command && (
        <CommandRow cmd={remedy.command} />
      )}
      {remedy.section === "login" && (
        <div className="text-aux text-fg-faint">
          Start a session (the terminal prompts you to log in), or run{" "}
          <code className="font-mono">claude</code> in your shell.
        </div>
      )}
      {remedy.section === "verify" && (
        <div className="flex flex-col gap-2">
          <div className="text-aux text-fg-faint">
            Run <code className="font-mono">claude --version</code> in a
            terminal to check it works.
          </div>
          {status.path && (
            <CommandRow
              cmd={`xattr -d com.apple.quarantine ${status.path}`}
              note="If macOS blocked the binary."
            />
          )}
        </div>
      )}
      <a
        href="https://code.claude.com/docs/en/setup"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-aux text-primary transition-colors hover:text-primary-bright"
      >
        <Icon name="arrow-up-right" size={12} />
        Install docs
      </a>
    </div>
  );
}

function CommandRow({ cmd, note }: { cmd: string; note?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-2 py-1.5">
        <code className="flex-1 overflow-x-auto font-mono text-aux text-working">
          {cmd}
        </code>
        <button
          type="button"
          onClick={() => void window.api.clipboardWriteText(cmd)}
          className="shrink-0 text-aux text-fg-faint transition-colors hover:text-fg"
        >
          copy
        </button>
      </div>
      {note && <div className="mt-1 text-label text-fg-faint">{note}</div>}
    </div>
  );
}

function BinaryOverride({
  cliStatus,
  checking,
  onSetBinPath,
}: {
  cliStatus: CliStatus | null;
  checking: boolean;
  onSetBinPath: (path: string | null) => void;
}) {
  const [binPath, setBinPath] = useState(
    cliStatus?.source === "override" ? (cliStatus.path ?? "") : "",
  );
  return (
    <Card title="Binary override">
      <div className="px-4 py-3.5">
        <p className="text-meta text-fg-faint">
          Point the app at a specific claude binary. Applies to app launches.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={binPath}
            onChange={(e) => setBinPath(e.target.value)}
            placeholder="/absolute/path/to/claude"
            className="min-w-0 flex-1 rounded-md border border-ink-700 bg-well px-2.5 py-1.5 font-mono text-aux text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="button"
            onClick={() => onSetBinPath(binPath.trim() || null)}
            disabled={checking}
            className="shrink-0 rounded-md border border-ink-700 bg-ink-925 px-3 py-1.5 text-body text-fg transition-colors hover:bg-ink-850 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}

/** A labelled CLI readout row: faint label, mono value, optional amber caveat. */
function DetailRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: string;
}) {
  return (
    <div className="flex gap-3 border-b border-ink-850 px-4 py-2.5 text-aux">
      <span className="w-16 shrink-0 text-fg-faint">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="break-all font-mono text-fg-muted">{value}</div>
        {warn && (
          <div className="mt-1 text-meta text-accent-bright">{warn}</div>
        )}
      </div>
    </div>
  );
}

type ReqState = "pass" | "fail" | "unknown";

/** The CLI status kind is the rollup of these gates; surface them as a checklist so a tripped CLI shows
 *  *which* gate failed. notFound/unknown can't probe version or auth, so those read as unknown, not pass. */
function requirementsFor(
  status: CliStatus | null,
): { label: string; state: ReqState }[] {
  const kind = status?.kind;
  const found: ReqState =
    kind === undefined || kind === "unknown"
      ? "unknown"
      : kind === "notFound"
        ? "fail"
        : "pass";
  // version and auth are only knowable once a binary resolved and reported.
  const probeable =
    kind === "ready" || kind === "outdated" || kind === "loggedOut";
  const version: ReqState = !probeable
    ? "unknown"
    : kind === "outdated"
      ? "fail"
      : "pass";
  const auth: ReqState = !probeable
    ? "unknown"
    : kind === "loggedOut"
      ? "fail"
      : "pass";
  return [
    { label: "CLI found on PATH", state: found },
    { label: "Version meets minimum", state: version },
    { label: "Authenticated", state: auth },
  ];
}

function Req({ state, label }: { state: ReqState; label: string }) {
  return (
    <div className="flex items-center gap-2 text-aux">
      {state === "unknown" ? (
        <span className="flex h-3.5 w-3.5 items-center justify-center">
          <span className="h-px w-2 bg-ink-600" />
        </span>
      ) : (
        <Icon
          name={state === "pass" ? "check" : "triangle-alert"}
          size={13}
          className={state === "pass" ? "text-working" : "text-danger"}
        />
      )}
      <span className={state === "fail" ? "text-fg" : "text-fg-muted"}>
        {label}
      </span>
    </div>
  );
}

function AccountSection({ account }: { account: Account | null }) {
  const mode = account?.billingMode;
  const plan =
    mode === "subscription"
      ? "Claude · subscription"
      : mode === "api"
        ? "API Usage Billing"
        : "Claude";
  const gauges = [
    { label: "5-hour", w: account?.fiveHour },
    { label: "7-day", w: account?.sevenDay },
    { label: "7-day · Sonnet", w: account?.sevenDaySonnet },
    { label: "7-day · Opus", w: account?.sevenDayOpus },
  ].filter((g): g is { label: string; w: RateLimit } => g.w != null);
  return (
    <>
      <Header
        title="Account"
        lede="Who Code-by-wire reads usage for. Identity comes from ~/.claude; rate limits ride the live status capture."
      />
      <Card title="Identity">
        <Row label="Signed in" desc="Read from ~/.claude">
          <span className="font-mono text-aux text-fg">
            {account?.email ?? "—"}
          </span>
        </Row>
        <Row label="Plan" desc="Detected from rate-limit presence">
          <span className="text-body text-fg">{plan}</span>
        </Row>
      </Card>

      {mode === "subscription" && gauges.length > 0 && (
        <Card title="Rate limits">
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            {gauges.map((g) => {
              const pct = clampPct(Math.round(g.w.usedPct));
              return (
                <div key={g.label}>
                  <RateBar
                    label={g.label}
                    pct={pct}
                    value={`${pct}%`}
                    color={ctxColor(pct)}
                  />
                  <div className="ml-14 mt-0.5 text-label text-fg-faint">
                    resets in {formatResetCountdown(g.w.resetsAt, Date.now())}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {mode === "api" && (
        <Card title="API billing">
          <Row label="Usage" desc="Billed per API usage">
            <span className="text-body text-fg">API Usage Billing</span>
          </Row>
        </Card>
      )}
    </>
  );
}

function AppearanceSection() {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  return (
    <>
      <Header
        title="Appearance"
        lede="The look is fixed to the Instrument theme. The comfort settings follow your system."
      />
      <Card title="Theme">
        <Row
          label="Theme"
          desc="Dark glass-cockpit; color reserved for live state"
        >
          <div className="flex items-center gap-2">
            <span className="text-body text-fg">Instrument · dark</span>
            <Pill>locked</Pill>
          </div>
        </Row>
        <Row label="Reduce motion" desc="Follows your system setting">
          <span className="text-body text-fg-muted">
            {reduceMotion ? "On" : "Off"}
          </span>
        </Row>
      </Card>
    </>
  );
}

function AboutSection({ update }: { update?: UpdateControls }) {
  return (
    <>
      <Header title="About" />
      <Card title="Code-by-wire">
        <div className="flex flex-col gap-3 px-4 py-4">
          <Wordmark />
          <p className="max-w-[54ch] text-body leading-relaxed text-fg-muted">
            A fly-by-wire cockpit for your Claude Code sessions. Observe,
            manage, and review every run from one instrument panel.
          </p>
          <div className="font-mono text-meta text-fg-faint">
            github.com/luojiahai/code-by-wire
          </div>
        </div>
      </Card>
      {update && <SoftwareUpdateCard update={update} />}
    </>
  );
}
