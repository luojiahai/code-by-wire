import type { CliStatus } from "@shared/cli-status";
import { footerView } from "../ui/rail-footer";
import { cliStatusView } from "../ui/cli-status-view";
import { Icon } from "../ui/icons";
import { Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";
import type { Translations } from "../i18n";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  DocsLink,
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
          <DocsLink
            href="https://code.claude.com/docs/en/setup"
            label={t.settings.cli.installDocs}
          />
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
