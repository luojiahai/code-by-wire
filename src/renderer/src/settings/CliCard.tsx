import { useState } from "react";
import type { CliStatus } from "@shared/cli-status";
import { footerView } from "../ui/rail-footer";
import { cliStatusView } from "../ui/cli-status-view";
import { remediesFor, INSTALL_TABS } from "../ui/cli-remedies";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";
import { Card } from "../shell/page-primitives";
import {
  SubsystemHeader,
  ReadoutRow,
  FaultBand,
  RailButton,
  EditLink,
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
 *  FAULT for everything else — the fault band below names which gate tripped. */
function stateWord(status: CliStatus | null): string {
  if (status === null) return "CHECKING";
  return status.kind === "ready" ? "READY" : "FAULT";
}

/**
 * The Claude Code CLI subsystem card (design spec "subsystem grammar"): header rail says the state
 * once; readout rows carry version/binary/config with the binary override editable in place (the old
 * standalone Binary override card is gone); the fault band appears only when a gate trips, holding
 * the remedy content the old always-on checklist and remedy block used to spread across the card.
 */
export function CliCard({
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
  const tone = TONE[footerView(cliStatus).dot];
  const [editingOverride, setEditingOverride] = useState(false);
  const [binPath, setBinPath] = useState(
    cliStatus?.source === "override" ? (cliStatus.path ?? "") : "",
  );

  return (
    <Card title="Claude Code CLI">
      <SubsystemHeader
        tone={tone}
        word={stateWord(cliStatus)}
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
            Recheck
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
        label="Version"
        value={cliStatus?.version ? `v${cliStatus.version}` : "not detected"}
      />
      <ReadoutRow
        label="Binary"
        value={cliStatus?.path ?? "no binary resolved"}
        warn={
          cliStatus && cliStatus.duplicates.length > 1
            ? "Multiple claude installs found; the app uses the first."
            : undefined
        }
        edit={
          <EditLink onClick={() => setEditingOverride((v) => !v)}>
            Override
          </EditLink>
        }
        expanded={
          editingOverride ? (
            <div className="flex gap-2">
              <input
                value={binPath}
                onChange={(e) => setBinPath(e.target.value)}
                placeholder="/absolute/path/to/claude"
                className="min-w-0 flex-1 rounded-md border border-ink-700 bg-well px-2.5 py-1.5 font-mono text-aux text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <RailButton
                onClick={() => onSetBinPath(binPath.trim() || null)}
                disabled={checking}
              >
                Save
              </RailButton>
            </div>
          ) : undefined
        }
      />
      <ReadoutRow
        label="Config"
        value={cliStatus?.configDir.active ?? "~/.claude"}
        warn={
          cliStatus?.configDir.mismatch
            ? `The CLI uses ${cliStatus.configDir.recovered}; restart after fixing.`
            : undefined
        }
      />
    </Card>
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
