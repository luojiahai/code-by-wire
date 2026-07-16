import { useState } from "react";
import type { CliStatus } from "@shared/cli-status";
import { footerView } from "../ui/rail-footer";
import { cliStatusView } from "../ui/cli-status-view";
import {
  remediesFor,
  INSTALL_TABS,
  installTabLabel,
  installTabNote,
} from "../ui/cli-remedies";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";
import { Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";
import type { Translations } from "../i18n";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  type LampTone,
} from "./system-primitives";

/** footerView dot → lamp tone (same hues the title-bar Sys lamp uses). */
const TONE: Record<ReturnType<typeof footerView>["dot"], LampTone> = {
  ok: "live",
  warn: "warn",
  error: "error",
  idle: "idle",
};

/** The annunciator word: READY when the engine is green, CHECKING before the first verdict,
 *  FAULT for everything else — the fault band below names which gate tripped. Resolved per call
 *  (not module scope) so a locale switch applies immediately. */
function stateWord(status: CliStatus | null, t: Translations): string {
  if (status === null) return t.settings.cli.stateChecking;
  return status.kind === "ready"
    ? t.settings.cli.stateReady
    : t.settings.cli.stateFault;
}

/**
 * The Claude Code CLI subsystem card (design spec "subsystem grammar"): header rail says the state
 * once; readout rows carry version/config; the fault band appears only when a gate trips, holding the
 * remedy content. The app no longer resolves or overrides which `claude` binary runs — Managed sessions
 * and this card's probes both go through the user's login shell, so there's nothing here to override.
 */
export function CliCard({
  cliStatus,
  checking,
  onRecheck,
}: {
  cliStatus: CliStatus | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const { t } = useI18n();
  const view = cliStatus ? cliStatusView(cliStatus, t) : null;
  const tone = TONE[footerView(cliStatus).dot];

  return (
    <Card title={t.settings.cli.title}>
      <SubsystemHeader
        tone={tone}
        word={stateWord(cliStatus, t)}
        action={
          <RailButton
            onClick={onRecheck}
            disabled={checking || cliStatus === null}
          >
            <Icon
              name="rotate-ccw"
              size={13}
              className={checking ? "animate-spin" : ""}
            />
            {t.settings.cli.recheck}
          </RailButton>
        }
      />

      {cliStatus && cliStatus.kind !== "ready" && view && (
        <FaultBand headline={view.headline.toUpperCase()}>
          <div className="mb-2">{view.detail}</div>
          <Remedy status={cliStatus} />
        </FaultBand>
      )}

      <ReadoutRow
        label={t.settings.cli.version}
        value={
          cliStatus?.version
            ? `v${cliStatus.version}`
            : t.settings.cli.notDetected
        }
      />
      <ReadoutRow
        label={t.settings.cli.config}
        value={cliStatus?.configDir.active ?? "~/.claude"}
      />
    </Card>
  );
}

/** The remedy block for a non-ready CLI: install tabs, an update/verify command, or login guidance, plus
 *  a docs link. `installMethod` is always "unknown" — the app no longer resolves a binary path to guess
 *  it from — so the install tab and upgrade command default to a fixed choice rather than a smart guess. */
function Remedy({ status }: { status: CliStatus }) {
  const { t } = useI18n();
  const remedy = remediesFor({ kind: status.kind, installMethod: "unknown" });
  const [tab, setTab] = useState(remedy.defaultTab ?? "native");
  const activeInstall = INSTALL_TABS.find((entry) => entry.method === tab);
  return (
    <div className="flex flex-col gap-2.5">
      {remedy.section === "install" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {INSTALL_TABS.map((entry) => (
              <button
                key={entry.method}
                type="button"
                onClick={() => setTab(entry.method)}
                className={cx(
                  "rounded-md px-2 py-1 text-aux transition-colors",
                  tab === entry.method
                    ? "bg-ink-700 text-fg"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {installTabLabel(entry.method, t)}
              </button>
            ))}
          </div>
          {activeInstall && (
            <CommandRow
              cmd={activeInstall.command}
              note={installTabNote(activeInstall.method, t)}
            />
          )}
        </div>
      )}
      {remedy.section === "update" && remedy.command && (
        <CommandRow cmd={remedy.command} />
      )}
      {remedy.section === "login" && (
        <div className="text-aux text-fg-faint">
          {t.settings.cli.loginBefore} <code className="font-mono">claude</code>{" "}
          {t.settings.cli.loginAfter}
        </div>
      )}
      {remedy.section === "verify" && (
        <div className="text-aux text-fg-faint">
          {t.settings.cli.verifyBefore}{" "}
          <code className="font-mono">claude --version</code>{" "}
          {t.settings.cli.verifyAfter}
        </div>
      )}
      <a
        href="https://code.claude.com/docs/en/setup"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-aux text-primary transition-colors hover:text-primary-bright"
      >
        <Icon name="arrow-up-right" size={12} />
        {t.settings.cli.installDocs}
      </a>
    </div>
  );
}

function CommandRow({ cmd, note }: { cmd: string; note?: string }) {
  const { t } = useI18n();
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
          {t.settings.cli.copyAction}
        </button>
      </div>
      {note && <div className="mt-1 text-label text-fg-faint">{note}</div>}
    </div>
  );
}
