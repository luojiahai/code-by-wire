import { useEffect, useMemo, useState } from "react";
import type {
  Session,
  Account,
  Subagent,
  BackgroundShell,
} from "@shared/types";
import { Icon } from "../ui/icons";
import { useCopyFlash } from "../ui/use-copy-flash";
import { Tabs } from "../ui/Tabs";
import { TranscriptView } from "./TranscriptView";
import { TerminalView } from "../terminal/TerminalView";
import { useTranscript, type DocState } from "./use-transcript";
import { ContextPanel } from "./panels/ContextPanel";
import { StructureDock } from "./panels/StructureDock";
import { SubagentDrill, type DrillCrumb } from "./SubagentDrill";
import { indexByDispatch, type DispatchDrill } from "./drill-index";
import { ShellDrill } from "./ShellDrill";
import { useSubagentTranscript } from "./use-subagent-transcript";
import { useShells } from "./use-shells";
import { useShellOutput, type ShellOutputState } from "./use-shell-output";
import { TokensPanel } from "./panels/TokensPanel";
import { TokenSpeedPanel } from "./panels/TokenSpeedPanel";
import { useTasks } from "./use-tasks";
import { useMetrics, type MetricsState } from "./use-metrics";
import { HeaderActions } from "./HeaderActions";
import { Annunciator } from "./Annunciator";
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
      <header className="shrink-0 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">
              {s.title}
            </span>
            <SessionIdChip id={s.id} />
          </div>
          <HeaderActions session={s} canSpawn={canSpawn} onAdopt={onAdopt} />
        </div>
        <Annunciator session={s} git={metrics?.git} pr={metrics?.pr} />
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
  const { copied, copy } = useCopyFlash(id);
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
  const shells = useShells(s.id);
  // The drill-stack: empty = the Session transcript; one crumb = drilled into a Subagent or a shell.
  const [drill, setDrill] = useState<DrillCrumb[]>([]);
  const top = drill[drill.length - 1];
  const activeAgentId = top?.kind === "subagent" ? top.agentId : undefined;
  const activeShellId = top?.kind === "shell" ? top.shellId : undefined;
  // Both polls lifted here (always mounted) and gated on their active id, so they survive the Managed
  // Terminal ⇄ Transcript toggle. Each is a no-op until something of its kind is drilled.
  const subagentDoc = useSubagentTranscript(s.id, activeAgentId);
  const shellOutput = useShellOutput(s.id, activeShellId);
  // Resolve an inline dispatch by its tool_use_id against the session's full nested forest, rebuilt each
  // poll. A dispatch is drillable iff it's a key; clicking PUSHES the resolved subagent (deep), unlike a
  // lane click which resets to depth 1.
  const dispatchIndex = useMemo(
    () => indexByDispatch(doc?.subagents ?? []),
    [doc],
  );
  const dispatchDrill: DispatchDrill = useMemo(
    () => ({
      index: dispatchIndex,
      onDrill: (toolUseId) => {
        const node = dispatchIndex.get(toolUseId);
        if (node)
          setDrill((d) => [
            ...d,
            { kind: "subagent", agentId: node.id, label: node.type },
          ]);
      },
    }),
    [dispatchIndex],
  );
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <CenterView
            session={s}
            doc={doc}
            subagentDoc={subagentDoc}
            shellOutput={shellOutput}
            drill={drill}
            onNavigate={(depth) => setDrill((d) => d.slice(0, depth))}
            dispatchDrill={dispatchDrill}
          />
        </div>
        <StructureDock
          tasks={tasks ?? []}
          doc={doc}
          shells={shells ?? []}
          now={now}
          activeAgentId={activeAgentId}
          activeShellId={activeShellId}
          onDrill={(agent: Subagent) =>
            setDrill([
              { kind: "subagent", agentId: agent.id, label: agent.type },
            ])
          }
          onDrillShell={(shell: BackgroundShell) =>
            setDrill([
              { kind: "shell", shellId: shell.id, label: shell.command },
            ])
          }
        />
      </div>
      <OverlayScroll
        className="hidden w-72 shrink-0 border-l border-ink-800 bg-ink-925 lg:block"
        contentClassName="flex flex-col gap-4 p-4"
      >
        <ContextPanel
          live={s.liveContext ?? null}
          context={doc?.context ?? null}
          contextPct={s.contextPct}
          contextWindow={s.contextWindow}
        />
        <TokensPanel
          usage={s.usage}
          model={s.model}
          liveCostUsd={s.liveCostUsd}
          billingMode={account?.billingMode}
        />
        <TokenSpeedPanel speed={metrics ? metrics.tokenSpeed : null} />
      </OverlayScroll>
    </div>
  );
}

type CenterTab = "terminal" | "transcript";

/** The center column's live view, dispatched by management kind. A non-empty drill-stack renders the
 *  drilled Subagent or Shell surface in place of the Session transcript. Observed = read-only transcript;
 *  Managed gets the Terminal ⇄ Transcript toggle. */
function CenterView({
  session: s,
  doc,
  subagentDoc,
  shellOutput,
  drill,
  onNavigate,
  dispatchDrill,
}: {
  session: Session;
  doc: DocState;
  subagentDoc: DocState;
  shellOutput: ShellOutputState;
  drill: DrillCrumb[];
  onNavigate: (depth: number) => void;
  dispatchDrill: DispatchDrill;
}) {
  const top = drill[drill.length - 1];
  // The full subagent path, so the breadcrumb shows Session › A › B … instead of just the top.
  // Filtering to subagent frames stays safe for the breadcrumb's index-based pop (onNavigate slices the
  // full stack): a shell crumb only ever appears alone, since every shell and lane drill resets the stack.
  const subagentCrumbs = drill
    .filter(
      (c): c is Extract<DrillCrumb, { kind: "subagent" }> =>
        c.kind === "subagent",
    )
    .map((c) => ({ agentId: c.agentId, label: c.label }));
  const drilledView =
    top?.kind === "shell" ? (
      <ShellDrill
        label={top.label}
        onBack={() => onNavigate(0)}
        output={shellOutput}
      />
    ) : top?.kind === "subagent" ? (
      <SubagentDrill
        crumbs={subagentCrumbs}
        onNavigate={onNavigate}
        doc={subagentDoc}
        dispatchDrill={dispatchDrill}
      />
    ) : null;

  if (s.management === "observed")
    return (
      drilledView ?? (
        <RenderedTranscript
          session={s}
          doc={doc}
          dispatchDrill={dispatchDrill}
        />
      )
    );
  return (
    <ManagedCenter
      session={s}
      doc={doc}
      drilledView={drilledView}
      drilled={drill.length > 0}
      drilledKey={
        top ? (top.kind === "shell" ? top.shellId : top.agentId) : undefined
      }
      dispatchDrill={dispatchDrill}
    />
  );
}

/** A Managed session has both a live terminal and the transcript the CLI is writing, so it toggles
 *  between them — default Terminal. Toggling away only detaches xterm (the pty keeps buffering), so
 *  toggling back restores full scrollback. Drilling a lane or a shell auto-selects the Transcript tab;
 *  the Terminal stays live, and the user can flip back to it (the drill persists). */
function ManagedCenter({
  session: s,
  doc,
  drilledView,
  drilled,
  drilledKey,
  dispatchDrill,
}: {
  session: Session;
  doc: DocState;
  drilledView: React.ReactNode;
  drilled: boolean;
  drilledKey?: string;
  dispatchDrill: DispatchDrill;
}) {
  const [tab, setTab] = useState<CenterTab>("terminal");
  useEffect(() => {
    if (drilledKey) setTab("transcript");
  }, [drilledKey]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tab={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === "terminal" ? (
          <div className="h-full">
            <TerminalView sessionId={s.id} />
          </div>
        ) : drilled ? (
          drilledView
        ) : (
          <RenderedTranscript
            session={s}
            doc={doc}
            dispatchDrill={dispatchDrill}
          />
        )}
      </div>
    </div>
  );
}

/** The scrolling transcript, shared by the Observed center and the Managed Transcript tab. */
function RenderedTranscript({
  session: s,
  doc,
  dispatchDrill,
}: {
  session: Session;
  doc: DocState;
  dispatchDrill?: DispatchDrill;
}) {
  return (
    <OverlayScroll className="h-full">
      <TranscriptView
        doc={doc}
        project={s.project}
        state={s.state}
        readOnly={s.management === "observed"}
        dispatchDrill={dispatchDrill}
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

/** The Terminal/Transcript view switch: underline tabs with their leading glyphs, the active one
 *  carrying a wire underline on the bar's hairline. */
function ViewTabs({
  tab,
  onChange,
}: {
  tab: CenterTab;
  onChange: (t: CenterTab) => void;
}) {
  return (
    <div className="flex h-[34px] shrink-0 items-stretch border-b border-ink-800 bg-ink-925 pr-3">
      <Tabs<CenterTab>
        tabs={CENTER_TABS}
        value={tab}
        onChange={onChange}
        variant="underline"
      />
    </div>
  );
}
