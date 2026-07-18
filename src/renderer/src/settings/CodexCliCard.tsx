import type { CliStatus } from "@shared/cli-status";
import { footerView } from "../ui/rail-footer";
import { Icon } from "../ui/icons";
import { Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  type LampTone,
} from "./system-primitives";

const TONE: Record<ReturnType<typeof footerView>["dot"], LampTone> = {
  ok: "live",
  warn: "warn",
  error: "error",
  idle: "idle",
};

/** The Codex CLI subsystem card: same anatomy as the Claude card (state rail, readouts, fault
 *  band), with codex-sized remedies — an install command and a login pointer, no tab set and no
 *  version floor. Probes run through the same login-shell/PATHEXT spawn form (main/cli-check.ts). */
export function CodexCliCard({
  status,
  checking,
  onRecheck,
}: {
  status: CliStatus | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const { t } = useI18n();
  const word =
    status === null
      ? t.settings.cli.stateChecking
      : status.kind === "ready"
        ? t.settings.cli.stateReady
        : t.settings.cli.stateFault;
  return (
    <Card title={t.settings.codexCli.title}>
      <SubsystemHeader
        tone={TONE[footerView(status).dot]}
        word={word}
        action={
          <RailButton
            onClick={onRecheck}
            disabled={checking || status === null}
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
      {status && status.kind !== "ready" && (
        <FaultBand headline={t.settings.codexCli.notInstalledHeadline}>
          <div className="flex flex-col gap-1.5">
            <div>
              {t.settings.codexCli.installHint}{" "}
              <code className="font-mono">npm i -g @openai/codex</code>
              {", "}
              {t.settings.codexCli.loginHint}{" "}
              <code className="font-mono">codex login</code>.
            </div>
            <a
              href="https://developers.openai.com/codex/cli"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-aux text-primary transition-colors hover:text-primary-bright"
            >
              <Icon name="arrow-up-right" size={12} />
              {t.settings.codexCli.docs}
            </a>
          </div>
        </FaultBand>
      )}
      <ReadoutRow
        label={t.settings.cli.version}
        value={
          status?.version ? `v${status.version}` : t.settings.cli.notDetected
        }
      />
      <ReadoutRow
        label={t.settings.cli.config}
        value={status?.configDir.active ?? "~/.codex"}
      />
    </Card>
  );
}
