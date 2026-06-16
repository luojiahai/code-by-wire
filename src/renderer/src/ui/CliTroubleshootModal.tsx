import { useState } from "react";
import type { CliStatus } from "@shared/cli-status";
import { remediesFor, INSTALL_TABS } from "./cli-remedies";

export function CliTroubleshootModal({
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
  const remedy = remediesFor({
    kind: status.kind,
    installMethod: status.installMethod,
  });
  const [tab, setTab] = useState(remedy.defaultTab ?? "native");
  const [binPath, setBinPath] = useState(
    status.source === "override" ? (status.path ?? "") : "",
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[90vw] rounded-xl border border-ink-700 bg-ink-900 font-mono text-xs text-fg-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
          <span className="text-sm font-semibold text-fg">Claude Code CLI</span>
          <span className="ml-auto uppercase tracking-wide text-fg-faint">
            {status.kind}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div className="text-fg-faint">
            {status.path
              ? `Resolved: ${status.path}`
              : "No claude binary resolved."}
            {status.duplicates.length > 1 && (
              <div className="mt-1 text-accent-bright">
                Multiple claude installs found — the app uses the first above.
              </div>
            )}
          </div>

          {remedy.section === "install" && (
            <div>
              <div className="mb-2 flex gap-1.5">
                {INSTALL_TABS.map((t) => (
                  <button
                    key={t.method}
                    onClick={() => setTab(t.method)}
                    className={
                      tab === t.method
                        ? "rounded bg-ink-700 px-2 py-1 text-fg"
                        : "px-2 py-1"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {INSTALL_TABS.filter((t) => t.method === tab).map((t) => (
                <CommandRow key={t.method} cmd={t.command} note={t.note} />
              ))}
            </div>
          )}
          {remedy.section === "update" && remedy.command && (
            <CommandRow cmd={remedy.command} />
          )}
          {remedy.section === "login" && (
            <div className="text-fg-faint">
              Start a session (the terminal prompts you to log in), or run{" "}
              <code>claude</code> in your shell.
            </div>
          )}
          {remedy.section === "verify" && (
            <div className="space-y-2 text-fg-faint">
              <div>
                Run <code>claude --version</code> in a terminal to check it
                works.
              </div>
              {status.path && (
                <CommandRow
                  cmd={`xattr -d com.apple.quarantine ${status.path}`}
                  note="If macOS blocked the binary."
                />
              )}
            </div>
          )}

          <div className="border-t border-ink-800 pt-3">
            <div className="mb-1 text-fg-faint">
              Binary path override (works for app launches):
            </div>
            <div className="flex gap-2">
              <input
                value={binPath}
                onChange={(e) => setBinPath(e.target.value)}
                placeholder="/absolute/path/to/claude"
                className="flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1 text-fg"
              />
              <button
                onClick={() => onSetBinPath(binPath.trim() || null)}
                disabled={checking}
                className="rounded border border-ink-700 px-2 py-1 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>

          <div className="text-fg-faint">
            Config dir: {status.configDir.active}
            {status.configDir.mismatch && (
              <span className="text-accent-bright">
                {" "}
                — the CLI uses {status.configDir.recovered}; restart after
                fixing.
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-ink-800 px-4 py-3">
          <a
            href="https://code.claude.com/docs/en/setup"
            target="_blank"
            rel="noreferrer"
            className="text-accent-bright"
          >
            ↗ Install docs
          </a>
          <button
            onClick={onRecheck}
            disabled={checking}
            className="ml-auto rounded border border-ink-700 px-2 py-1 disabled:opacity-60"
          >
            <span className={checking ? "inline-block animate-spin" : ""}>
              ↻
            </span>{" "}
            {checking ? "Checking…" : "Re-check"}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-ink-700 px-2 py-1"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandRow({ cmd, note }: { cmd: string; note?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded border border-ink-800 bg-ink-950 px-2 py-1.5">
        <code className="flex-1 overflow-x-auto text-working">{cmd}</code>
        <button
          onClick={() => void navigator.clipboard.writeText(cmd)}
          className="text-fg-faint"
        >
          copy
        </button>
      </div>
      {note && <div className="mt-1 text-[10px] text-fg-faint">{note}</div>}
    </div>
  );
}
