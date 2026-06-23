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
import { useTranscriptModals } from "./use-transcript-modals";
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
import { SessionTitle } from "./SessionTitle";
import { ObservedTerminal } from "./ObservedTerminal";
import { Annunciator } from "./Annunciator";
import { OverlayScroll } from "../ui/OverlayScroll";

export function Workspace({
  session: s,
  account,
  canSpawn,
  onAdopt,
  onFork,
  onEnd,
  onRename,
}: {
  session: Session;
  account: Account | null;
  /** Whether the Claude Code CLI is usable; gates Adopt and Fork (both spawn the CLI). */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  /** End the running Managed session (header-only; never offered in the observed-terminal panel). */
  onEnd: (id: string) => void;
  /** Persist a display-name override for this session (null/empty clears it). Applies to any session. */
  onRename: (id: string, title: string | null) => void;
}) {
  // Recomputed each render; App's 3s background re-sync re-renders this, so the timeline timestamps tick.
  const now = Date.now();
  const metrics = useMetrics(s.id);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950 text-fg">
      <header className="group/header shrink-0 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SessionTitle session={s} onRename={onRename} />
            <SessionIdChip id={s.id} />
          </div>
          <HeaderActions
            session={s}
            canSpawn={canSpawn}
            onAdopt={onAdopt}
            onFork={onFork}
            onEnd={onEnd}
          />
        </div>
        <Annunciator session={s} git={metrics?.git} pr={metrics?.pr} />
      </header>

      <div className="min-h-0 flex-1">
        <WorkspaceBody
          session={s}
          account={account}
          now={now}
          metrics={metrics}
          canSpawn={canSpawn}
          onAdopt={onAdopt}
          onFork={onFork}
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
  canSpawn,
  onAdopt,
  onFork,
}: {
  session: Session;
  account: Account | null;
  now: number;
  metrics: MetricsState;
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
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
  // The live BackgroundShell behind the drilled id, re-resolved each poll so the header's status/exit/
  // duration stay fresh while drilled (a running shell flips to completed on its own). undefined when
  // nothing is drilled, or when the shell was reaped from the list.
  const activeShell = activeShellId
    ? shells?.find((sh) => sh.id === activeShellId)
    : undefined;
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
            {
              kind: "subagent",
              agentId: node.id,
              type: node.type,
              description: node.description,
            },
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
            shell={activeShell}
            now={now}
            drill={drill}
            onNavigate={(depth) => setDrill((d) => d.slice(0, depth))}
            dispatchDrill={dispatchDrill}
            canSpawn={canSpawn}
            onAdopt={onAdopt}
            onFork={onFork}
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
              {
                kind: "subagent",
                agentId: agent.id,
                type: agent.type,
                description: agent.description,
              },
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
          anthropicDirect={account?.anthropicDirect}
        />
        <TokenSpeedPanel speed={metrics ? metrics.tokenSpeed : null} />
      </OverlayScroll>
    </div>
  );
}

type CenterTab = "terminal" | "transcript";

/** The center column's live view. Every session gets the Terminal ⇄ Transcript tabs; the Terminal tab is
 *  the live xterm for a running Managed session, else the ObservedTerminal panel (Fork always, Adopt once
 *  Ended). A non-empty drill-stack renders the drilled Subagent or Shell surface in the Transcript slot. */
function CenterView({
  session: s,
  doc,
  subagentDoc,
  shellOutput,
  shell,
  now,
  drill,
  onNavigate,
  dispatchDrill,
  canSpawn,
  onAdopt,
  onFork,
}: {
  session: Session;
  doc: DocState;
  subagentDoc: DocState;
  shellOutput: ShellOutputState;
  shell: BackgroundShell | undefined;
  now: number;
  drill: DrillCrumb[];
  onNavigate: (depth: number) => void;
  dispatchDrill: DispatchDrill;
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
}) {
  const top = drill[drill.length - 1];
  // The full subagent path, so the breadcrumb shows Session › A › B … instead of just the top.
  const subagentCrumbs = drill
    .filter(
      (c): c is Extract<DrillCrumb, { kind: "subagent" }> =>
        c.kind === "subagent",
    )
    .map((c) => ({
      agentId: c.agentId,
      type: c.type,
      description: c.description,
    }));
  const drilledView =
    top?.kind === "shell" ? (
      // Keyed by shell id so switching shells remounts the drill: CommandBlock's expand state and the
      // log scroll reset instead of bleeding from the previous shell.
      <ShellDrill
        key={top.shellId}
        shell={shell}
        label={top.label}
        now={now}
        onBack={() => onNavigate(0)}
        output={shellOutput}
      />
    ) : top?.kind === "subagent" ? (
      <SubagentDrill
        crumbs={subagentCrumbs}
        onNavigate={onNavigate}
        doc={subagentDoc}
        dispatchDrill={dispatchDrill}
        sessionId={s.id}
      />
    ) : null;
  const drilled = drill.length > 0;
  const drilledKey = top
    ? top.kind === "shell"
      ? top.shellId
      : top.agentId
    : undefined;

  // Every session gets the Terminal ⇄ Transcript tabs. The Terminal slot is the live in-app xterm only for
  // a Managed session that's still running; otherwise — an Observed session running in another terminal, or
  // any Ended session (including a just-exited Managed one that re-derives Observed) — it's the
  // ObservedTerminal panel: Fork is always offered, Adopt only once the session has Ended. Managed-live
  // opens on the Terminal tab; everything else opens on Transcript (its read-only conversation leads).
  const hasLiveTerminal = s.management === "managed" && s.state !== "ended";
  return (
    <TabbedCenter
      session={s}
      doc={doc}
      defaultTab={hasLiveTerminal ? "terminal" : "transcript"}
      terminalSlot={
        hasLiveTerminal ? (
          <TerminalView sessionId={s.id} />
        ) : (
          <ObservedTerminal
            session={s}
            canSpawn={canSpawn}
            onAdopt={onAdopt}
            onFork={onFork}
          />
        )
      }
      drilledView={drilledView}
      drilled={drilled}
      drilledKey={drilledKey}
      dispatchDrill={dispatchDrill}
    />
  );
}

/** A two-tab center (Terminal ⇄ Transcript). `terminalSlot` is whatever the Terminal tab shows — the live
 *  xterm for a running Managed session, or the ObservedTerminal panel otherwise — and `defaultTab` sets
 *  which tab opens first (Terminal for a live Managed session, else Transcript). Toggling away only detaches
 *  the terminal slot; toggling back restores it. Drilling a lane or shell auto-selects the Transcript tab. */
function TabbedCenter({
  session: s,
  doc,
  defaultTab,
  terminalSlot,
  drilledView,
  drilled,
  drilledKey,
  dispatchDrill,
}: {
  session: Session;
  doc: DocState;
  defaultTab: CenterTab;
  terminalSlot: React.ReactNode;
  drilledView: React.ReactNode;
  drilled: boolean;
  drilledKey?: string;
  dispatchDrill: DispatchDrill;
}) {
  const [tab, setTab] = useState<CenterTab>(defaultTab);
  // Follow the live terminal when it stands up in place. Adopt resumes this same id, so Workspace never
  // remounts and `tab` keeps its seeded value, but defaultTab flips to "terminal" once the pty is live.
  // Switch only toward "terminal": a session ending (defaultTab back to "transcript") shouldn't yank the
  // user off the terminal they were watching, and a manual tab choice on a live session stays put.
  useEffect(() => {
    if (defaultTab === "terminal") setTab("terminal");
  }, [defaultTab]);
  useEffect(() => {
    if (drilledKey) setTab("transcript");
  }, [drilledKey]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tab={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === "terminal" ? (
          <div className="h-full">{terminalSlot}</div>
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
  const readOnly = s.management === "observed";
  const { onOpen, modals } = useTranscriptModals(s.id);
  return (
    <OverlayScroll className="h-full">
      <TranscriptView
        doc={doc}
        state={s.state}
        readOnly={readOnly}
        dispatchDrill={dispatchDrill}
        onOpen={onOpen}
      />
      {modals}
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
