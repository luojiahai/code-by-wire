import { useState, type ReactNode } from "react";
import type { CliStatus } from "@shared/cli-status";
import { remediesFor, INSTALL_TABS } from "./cli-remedies";
import { cliStatusView, type CliStatusView } from "./cli-status-view";
import { ModalShell } from "./ModalShell";
import { Icon } from "./icons";
import { cx } from "./atoms";

// Banner styling by tone. The dot + headline color and the tinted frame all key off the same tone,
// so the banner reads as one coherent status chip. ok → teal, warn → amber, error → red.
const BANNER: Record<
  CliStatusView["tone"],
  { frame: string; head: string; dot: string }
> = {
  ok: {
    frame: "border-working/40 bg-working/5",
    head: "text-working-bright",
    dot: "bg-working",
  },
  warn: {
    frame: "border-accent/40 bg-accent/5",
    head: "text-accent-bright",
    dot: "bg-accent",
  },
  error: {
    frame: "border-danger/40 bg-danger/5",
    head: "text-danger",
    dot: "bg-danger",
  },
};

/**
 * The single home for Claude Code CLI status and config, opened from the rail panel's info button in any
 * state. Built on ModalShell (dimmed+blurred overlay, centered panel, Escape/overlay-click close, Tab
 * focus-trap, focus restore). The layout is invariant across states: a status banner, a version/path/config
 * readout, the binary override, and the footer actions. Only the banner is dynamic — its tone, headline,
 * detail, and (when not ready) the remedy commands change with the CLI's state; the rest never reshapes.
 */
export function CliStatusModal({
  status,
  checking,
  onClose,
  onRecheck,
  onSetBinPath,
}: {
  status: CliStatus;
  /** A check is in flight (Re-check or Save) — spin the Re-check glyph and disable both actions. */
  checking: boolean;
  onClose: () => void;
  onRecheck: () => void;
  onSetBinPath: (path: string | null) => void;
}) {
  const view = cliStatusView(status);
  const remedy = remediesFor({
    kind: status.kind,
    installMethod: status.installMethod,
  });
  const banner = BANNER[view.tone];
  const [tab, setTab] = useState(remedy.defaultTab ?? "native");
  const activeInstall = INSTALL_TABS.find((t) => t.method === tab);
  const [binPath, setBinPath] = useState(
    status.source === "override" ? (status.path ?? "") : "",
  );

  return (
    <ModalShell
      labelledBy="cli-status-title"
      widthClass="w-[460px] max-w-[90vw]"
      onClose={onClose}
    >
      <div id="cli-status-title" className="text-sm font-semibold text-fg">
        Claude Code CLI
      </div>

      {/* The one dynamic region: tone, headline, advice, and any remedy commands. */}
      <div className={cx("mt-4 rounded-lg border px-3 py-2.5", banner.frame)}>
        <div
          className={cx(
            "flex items-center gap-2 text-[13px] font-semibold",
            banner.head,
          )}
        >
          <span className={cx("h-2 w-2 rounded-full", banner.dot)} />
          {view.headline}
          {status.version && (
            <span className="ml-auto font-mono text-[11px] font-normal text-fg-muted">
              v{status.version}
            </span>
          )}
        </div>
        <div className="mt-1 text-[12px] text-fg-muted">{view.detail}</div>
        {status.kind !== "ready" && (
          <div className="mt-2.5 space-y-2">
            {remedy.section === "install" && (
              <div>
                <div className="mb-2 flex gap-1.5">
                  {INSTALL_TABS.map((t) => (
                    <button
                      key={t.method}
                      onClick={() => setTab(t.method)}
                      className={cx(
                        "rounded-md px-2 py-1 text-[12px] transition-colors",
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
                  <CommandRow
                    cmd={activeInstall.command}
                    note={activeInstall.note}
                  />
                )}
              </div>
            )}
            {remedy.section === "update" && remedy.command && (
              <CommandRow cmd={remedy.command} />
            )}
            {remedy.section === "login" && (
              <div className="text-[12px] text-fg-faint">
                Start a session (the terminal prompts you to log in), or run{" "}
                <code className="font-mono">claude</code> in your shell.
              </div>
            )}
            {remedy.section === "verify" && (
              <div className="space-y-2">
                <div className="text-[12px] text-fg-faint">
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
          </div>
        )}
      </div>

      {/* Invariant readout. */}
      <div className="mt-4 space-y-1.5">
        <Row
          label="Version"
          value={status.version ? `v${status.version}` : "not detected"}
        />
        <Row
          label="Path"
          value={status.path ?? "No binary resolved."}
          note={
            status.duplicates.length > 1 ? (
              <span className="text-accent-bright">
                Multiple claude installs found; the app uses the first above.
              </span>
            ) : undefined
          }
        />
        <Row
          label="Config dir"
          value={status.configDir.active}
          note={
            status.configDir.mismatch ? (
              <span className="text-accent-bright">
                The CLI uses {status.configDir.recovered}; restart after fixing.
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Invariant: set a custom claude binary, available in every state. */}
      <div className="mt-4 border-t border-ink-800 pt-4">
        <label
          htmlFor="cli-bin-override"
          className="block text-[11px] font-semibold uppercase tracking-wider text-fg-muted"
        >
          Binary path override
        </label>
        <p className="mt-1 text-[11px] text-fg-faint">
          Works for app launches.
        </p>
        <div className="mt-1.5 flex gap-2">
          <input
            id="cli-bin-override"
            value={binPath}
            onChange={(e) => setBinPath(e.target.value)}
            placeholder="/absolute/path/to/claude"
            className="flex-1 rounded-md border border-ink-700 bg-well px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          <button
            onClick={() => onSetBinPath(binPath.trim() || null)}
            disabled={checking}
            className="rounded-md border border-ink-700 bg-ink-925 px-3 py-1.5 text-[13px] text-fg transition-colors hover:bg-ink-850 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>

      {/* Footer actions. */}
      <div className="mt-5 flex items-center gap-3 border-t border-ink-800 pt-4">
        <a
          href="https://code.claude.com/docs/en/setup"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-primary transition-colors hover:text-primary-bright"
        >
          <Icon name="arrow-up-right" size={13} />
          Install docs
        </a>
        <button
          onClick={onRecheck}
          disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-925 px-3 py-1.5 text-[13px] text-fg transition-colors hover:bg-ink-850 disabled:opacity-60"
        >
          <Icon
            name="rotate-ccw"
            size={13}
            className={checking ? "animate-spin" : undefined}
          />
          {checking ? "Checking…" : "Re-check"}
        </button>
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:text-fg"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

/** A labelled readout row: a fixed-width faint sans label, a mono value, and an optional sans warning. */
function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="w-24 shrink-0 text-fg-faint">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="break-all font-mono text-fg">{value}</div>
        {note && <div className="mt-1">{note}</div>}
      </div>
    </div>
  );
}

function CommandRow({ cmd, note }: { cmd: string; note?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-2 py-1.5">
        <code className="flex-1 overflow-x-auto font-mono text-[12px] text-working">
          {cmd}
        </code>
        <button
          onClick={() => void navigator.clipboard.writeText(cmd)}
          className="text-[12px] text-fg-faint transition-colors hover:text-fg"
        >
          copy
        </button>
      </div>
      {note && <div className="mt-1 text-[10px] text-fg-faint">{note}</div>}
    </div>
  );
}
