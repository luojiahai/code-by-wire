import { useEffect, useRef, useState } from "react";
import type { Session, Account, Subagent } from "@shared/types";
import { Icon } from "../ui/icons";
import { SegmentedTabs } from "../ui/SegmentedTabs";
import { TranscriptView } from "./TranscriptView";
import { TerminalView } from "../terminal/TerminalView";
import { useTranscript, type DocState } from "./use-transcript";
import { ContextPanel } from "./panels/ContextPanel";
import { CostPanel } from "./panels/CostPanel";
import { StructureDock } from "./panels/StructureDock";
import { SubagentDrill, type SubagentCrumb } from "./SubagentDrill";
import { useSubagentTranscript } from "./use-subagent-transcript";
import { TokensPanel } from "./panels/TokensPanel";
import { TokenSpeedPanel } from "./panels/TokenSpeedPanel";
import { GitPanel } from "./panels/GitPanel";
import { useTasks } from "./use-tasks";
import { useMetrics, type MetricsState } from "./use-metrics";
import { SessionPanel } from "./panels/SessionPanel";
import { HeaderActions } from "./HeaderActions";
import { ModeLabel } from "./ModeLabel";
import { OverlayScroll } from "../ui/OverlayScroll";

export function Workspace({
  session: s,
  account,
  canSpawn,
  onAdopt,
}: {
  session: Session;
  account: Account | null;
  /** Whether the Claude Code CLI is usable; gates Adopt (resume spawns the CLI), mirroring the rail's New. */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
}) {
  // Recomputed each render; App's 3s background re-sync re-renders this, so the timeline timestamps tick.
  const now = Date.now();
  const metrics = useMetrics(s.id);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950 text-fg">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">
              {s.title}
            </span>
            <button
              type="button"
              disabled
              title="Rename (coming soon)"
              aria-label="Rename session"
              className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-fg-faint opacity-40"
            >
              <Icon name="pencil" size={12} />
            </button>
            <SessionIdChip id={s.id} />
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px]">
            <ModeLabel session={s} />
            <span className="text-ink-700">·</span>
            <span className="min-w-0 truncate font-mono text-fg-faint">
              {s.project}
              {s.branch && ` · ${s.branch}`}
            </span>
          </div>
        </div>
        <HeaderActions session={s} canSpawn={canSpawn} onAdopt={onAdopt} />
      </header>

      <div className="min-h-0 flex-1">
        <WorkspaceBody
          session={s}
          account={account}
          now={now}
          metrics={metrics}
        />
      </div>
    </div>
  );
}

/** The short session id with a one-click copy: `a3f9…7c21` plus a copy glyph that flips to a check for a
 *  beat. The full id goes to the clipboard. Lives in the header so the rail needn't carry a Session row. */
function SessionIdChip({ id }: { id: string }) {
  const short = id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  function copy() {
    void navigator.clipboard?.writeText(id);
    setCopied(true);
    // Restart the timer each copy so a quick second click keeps the check glyph for its full beat
    // instead of the first timer flipping it back early; the effect above clears it on unmount.
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy session id (${id})`}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-fg-faint transition-colors hover:border-ink-600 hover:text-fg-muted"
    >
      <span>{short}</span>
      <Icon name={copied ? "check" : "copy"} size={10} />
    </button>
  );
}

/**
 * The workspace body: a center column (the live view with the Structure dock below it) and a right rail
 * of telemetry panels. One transcript poll (useTranscript) feeds the center, the context panel, and the
 * dock; the cost panel reads the Session directly. The rail and the dock both hide below `lg`.
 */
function WorkspaceBody({
  session: s,
  account,
  now,
  metrics,
}: {
  session: Session;
  account: Account | null;
  now: number;
  metrics: MetricsState;
}) {
  const doc = useTranscript(s.id);
  const tasks = useTasks(s.id);
  // The drill-stack: empty = the Session transcript, one crumb = drilled into that Subagent. Lives here
  // because the dock (which triggers the drill) and the center (which renders it) both read it. It's a
  // stack so N-deep nesting (drilling an inline dispatch, a later issue) can push onto it; this slice
  // drills one level from a lane, so onDrill sets a fresh single-crumb path. Workspace is keyed by
  // session id in App, so it remounts (and the stack clears) on a session switch.
  const [drill, setDrill] = useState<SubagentCrumb[]>([]);
  const activeAgentId = drill[drill.length - 1]?.agentId;
  // Lifted here (always mounted, like useTranscript) so the subagent poll survives the Managed Terminal ⇄
  // Transcript toggle — re-mounting it inside the tab would discard the change token and re-read the whole
  // file on every flip. Gated on activeAgentId: it polls only while a lane is drilled.
  const subagentDoc = useSubagentTranscript(s.id, activeAgentId);
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <CenterView
            session={s}
            doc={doc}
            subagentDoc={subagentDoc}
            drill={drill}
            onNavigate={(depth) => setDrill((d) => d.slice(0, depth))}
          />
        </div>
        <StructureDock
          tasks={tasks ?? []}
          doc={doc}
          now={now}
          activeAgentId={activeAgentId}
          onDrill={(agent: Subagent) =>
            setDrill([{ agentId: agent.id, label: agent.type }])
          }
        />
      </div>
      <OverlayScroll
        className="hidden w-72 shrink-0 border-l border-ink-800 bg-ink-925 lg:block"
        contentClassName="flex flex-col gap-4 p-4"
      >
        <SessionPanel session={s} />
        <ContextPanel
          live={s.liveContext ?? null}
          context={doc?.context ?? null}
          contextPct={s.contextPct}
          contextWindow={s.contextWindow}
        />
        <CostPanel
          usage={s.usage}
          model={s.model}
          liveCostUsd={s.liveCostUsd}
          billingMode={account?.billingMode}
        />
        <TokensPanel usage={s.usage} />
        <TokenSpeedPanel speed={metrics ? metrics.tokenSpeed : null} />
        <GitPanel git={metrics ? metrics.git : null} />
      </OverlayScroll>
    </div>
  );
}

type CenterTab = "terminal" | "transcript";

/** The center column's live view, dispatched by management kind. A non-empty drill-stack renders the
 *  drilled Subagent surface in place of the Session transcript. Observed = read-only transcript; Managed
 *  gets the Terminal ⇄ Transcript toggle. */
function CenterView({
  session: s,
  doc,
  subagentDoc,
  drill,
  onNavigate,
}: {
  session: Session;
  doc: DocState;
  subagentDoc: DocState;
  drill: SubagentCrumb[];
  onNavigate: (depth: number) => void;
}) {
  if (s.management === "observed")
    return drill.length > 0 ? (
      <SubagentDrill crumbs={drill} onNavigate={onNavigate} doc={subagentDoc} />
    ) : (
      <RenderedTranscript session={s} doc={doc} />
    );
  return (
    <ManagedCenter
      session={s}
      doc={doc}
      subagentDoc={subagentDoc}
      drill={drill}
      onNavigate={onNavigate}
    />
  );
}

/** A Managed session has both a live terminal and the transcript the CLI is writing, so it toggles
 *  between them — default Terminal. Toggling away only detaches xterm (the pty keeps buffering), so
 *  toggling back restores full scrollback. Drilling a lane auto-selects the Transcript tab and shows the
 *  drilled Subagent there; the Terminal stays live, and the user can flip back to it (the drill persists).
 *  The drill-stack lives only inside the Transcript surface. */
function ManagedCenter({
  session: s,
  doc,
  subagentDoc,
  drill,
  onNavigate,
}: {
  session: Session;
  doc: DocState;
  subagentDoc: DocState;
  drill: SubagentCrumb[];
  onNavigate: (depth: number) => void;
}) {
  const [tab, setTab] = useState<CenterTab>("terminal");
  const drilled = drill.length > 0;
  const drilledAgentId = drill[drill.length - 1]?.agentId;
  // Auto-select Transcript whenever the drilled agent changes — keyed on the agent id, not a boolean, so
  // drilling a second lane while parked on Terminal still pulls focus. Popping back to the Session (id →
  // undefined) intentionally leaves the tab where it is rather than forcing back to Terminal.
  useEffect(() => {
    if (drilledAgentId) setTab("transcript");
  }, [drilledAgentId]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tab={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === "terminal" ? (
          <div className="h-full">
            <TerminalView sessionId={s.id} />
          </div>
        ) : drilled ? (
          <SubagentDrill
            crumbs={drill}
            onNavigate={onNavigate}
            doc={subagentDoc}
          />
        ) : (
          <RenderedTranscript session={s} doc={doc} />
        )}
      </div>
    </div>
  );
}

/** The scrolling transcript, shared by the Observed center and the Managed Transcript tab. */
function RenderedTranscript({
  session: s,
  doc,
}: {
  session: Session;
  doc: DocState;
}) {
  return (
    <OverlayScroll className="h-full">
      <TranscriptView
        doc={doc}
        project={s.project}
        state={s.state}
        readOnly={s.management === "observed"}
      />
    </OverlayScroll>
  );
}

const CENTER_TABS: {
  id: CenterTab;
  label: string;
  icon: "square-terminal" | "messages-square";
}[] = [
  { id: "terminal", label: "Terminal", icon: "square-terminal" },
  { id: "transcript", label: "Transcript", icon: "messages-square" },
];

/** The segmented Terminal/Transcript control: the shared SegmentedTabs pill with the active tab raised. */
function ViewTabs({
  tab,
  onChange,
}: {
  tab: CenterTab;
  onChange: (t: CenterTab) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-3 py-2">
      <SegmentedTabs<CenterTab>
        tabs={CENTER_TABS}
        value={tab}
        onChange={onChange}
      />
    </div>
  );
}
