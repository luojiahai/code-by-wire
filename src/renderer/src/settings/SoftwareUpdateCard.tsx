import type { ReactNode } from "react";
import type { UpdateState } from "@shared/update";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";

/** Everything the card needs from App: the live state, the auto-check toggle value, and the actions. */
export interface UpdateControls {
  state: UpdateState;
  autoCheck: boolean;
  check: () => void;
  download: () => void;
  install: () => void;
  setAutoCheck: (enabled: boolean) => void;
}

type LampTone = "ok" | "warn" | "hot" | "error" | "idle";
const LAMP: Record<LampTone, string> = {
  ok: "bg-working",
  warn: "bg-accent",
  hot: "bg-accent-bright",
  error: "bg-danger",
  idle: "bg-ink-600",
};

/**
 * The "Software update" card in Settings → About. Renders one of the update phases plus the
 * check-on-launch toggle. Hidden entirely in dev (phase `unsupported`).
 */
export function SoftwareUpdateCard({ update }: { update: UpdateControls }) {
  const { state } = update;
  if (state.phase.kind === "unsupported") return null;

  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-925">
      <div className="border-b border-ink-850 px-4 py-2.5 font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
        Software update
      </div>
      <StatusRow update={update} />
      <div className="flex items-center justify-between gap-4 border-t border-ink-850 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">Check for updates on launch</div>
          <div className="mt-0.5 text-meta text-fg-faint">
            Look for a new version each time the app starts
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={update.autoCheck}
          onClick={() => update.setAutoCheck(!update.autoCheck)}
          className={cx(
            "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
            update.autoCheck ? "bg-primary" : "bg-ink-700",
          )}
        >
          <span
            className={cx(
              "absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all",
              update.autoCheck
                ? "right-[2px] bg-ink-900"
                : "left-[2px] bg-white",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function StatusRow({ update }: { update: UpdateControls }) {
  const { state } = update;
  const p = state.phase;

  let tone: LampTone = "idle";
  let headline = "Up to date";
  let detail: ReactNode = `v${state.currentVersion}`;
  let version: string | null = null;
  let action: ReactNode = null;
  let extra: ReactNode = null;

  switch (p.kind) {
    case "idle":
      headline = "Up to date";
      detail = `v${state.currentVersion}`;
      action = (
        <GhostButton onClick={update.check}>Check for updates</GhostButton>
      );
      break;
    case "upToDate":
      tone = "ok";
      headline = "Up to date";
      detail = `v${state.currentVersion}`;
      action = (
        <GhostButton onClick={update.check}>Check for updates</GhostButton>
      );
      break;
    case "checking":
      headline = "Checking for updates…";
      detail = `v${state.currentVersion}`;
      action = (
        <GhostButton disabled>
          <Icon name="loader-circle" size={13} className="animate-spin" />
        </GhostButton>
      );
      break;
    case "available":
      tone = "warn";
      headline = "Update available";
      version = p.version;
      detail = p.releaseDate
        ? `On v${state.currentVersion} · released ${p.releaseDate.slice(0, 10)}`
        : `On v${state.currentVersion}`;
      extra = (
        <button
          type="button"
          onClick={() => void window.api.openExternal(p.notesUrl)}
          className="mt-1.5 inline-flex items-center gap-1 text-meta text-primary transition-colors hover:text-primary-bright"
        >
          Release notes
          <Icon name="arrow-up-right" size={11} />
        </button>
      );
      action = <SolidButton onClick={update.download}>Download</SolidButton>;
      break;
    case "downloading":
      tone = "warn";
      headline = "Downloading update…";
      version = p.version;
      detail = `${formatMB(p.transferred)} of ${formatMB(p.total)} · ${Math.round(p.percent)}%`;
      extra = (
        <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-ink-800">
          <span
            className="block h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.round(p.percent)}%` }}
          />
        </div>
      );
      break;
    case "downloaded":
      tone = "hot";
      headline = "Update ready";
      version = p.version;
      detail = "Downloaded · installs when you next quit";
      extra = (
        <div className="mt-1 text-label text-fg-faint">
          or restart now to apply it immediately
        </div>
      );
      action = (
        <SolidButton onClick={update.install}>
          <Icon name="rotate-ccw" size={13} className="mr-1.5" />
          Restart now
        </SolidButton>
      );
      break;
    case "error":
      tone = "error";
      headline = "Couldn't check for updates";
      detail = `${p.message} · will retry on next launch`;
      action = <GhostButton onClick={update.check}>Retry</GhostButton>;
      break;
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span
        className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", LAMP[tone])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-fg">{headline}</span>
          {version && (
            <span className="rounded-sm border border-ink-700 px-1.5 py-0.5 font-mono text-meta text-primary-bright">
              v{version}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-meta text-fg-muted">{detail}</div>
        {extra}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-aux text-fg-muted transition-colors hover:border-ink-600 hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SolidButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-ink-600 bg-ink-800 px-3 py-1 text-aux text-fg transition-colors hover:bg-ink-700"
    >
      {children}
    </button>
  );
}

/** Bytes -> a compact "12.3 MB" string. */
function formatMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
