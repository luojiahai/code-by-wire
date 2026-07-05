import { useEffect, useMemo, useState } from "react";
import type { Session, Subagent, BackgroundShell } from "@shared/types";
import { TranscriptView } from "./TranscriptView";
import { useTranscriptModals } from "./use-transcript-modals";
import { TerminalView } from "../terminal/TerminalView";
import { useTranscript, type DocState } from "./use-transcript";
import { ActivityDock } from "./panels/ActivityDock";
import { SubagentDrill, type DrillCrumb } from "./SubagentDrill";
import { indexByDispatch, type DispatchDrill } from "./drill-index";
import { ShellDrill } from "./ShellDrill";
import { useSubagentTranscript } from "./use-subagent-transcript";
import { useShells } from "./use-shells";
import { useShellOutput, type ShellOutputState } from "./use-shell-output";
import { useTasks } from "./use-tasks";
import { ObservedTerminal } from "./ObservedTerminal";
import { OverlayScroll } from "../ui/OverlayScroll";
import { MiddleHeader } from "../shell/MiddleHeader";
import { SessionMenu } from "../shell/SessionMenu";

export function Workspace({
  session: s,
  canSpawn,
  onAdopt,
  onFork,
  onEnd,
  onRename,
  leftEdgeExposed,
  rightEdgeExposed,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable; gates Adopt and Fork (both spawn the CLI). */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  /** End the running Managed session (header-only; never offered in the observed-terminal panel). */
  onEnd: (id: string) => void;
  /** Persist a display-name override for this session (null/empty clears it). Applies to any session. */
  onRename: (id: string, title: string | null) => void;
  /** Whether the left pane isn't actually docked next to the header — reserves the cluster inset. */
  leftEdgeExposed: boolean;
  /** Whether the right pane isn't docked — the header clears the fixed right toggle cluster. */
  rightEdgeExposed: boolean;
}) {
  // Recomputed each render; App's 3s background re-sync re-renders this, so the timeline timestamps tick.
  const now = Date.now();
  // Every session gets the Terminal ⇄ Transcript toggle. The Terminal side is the live in-app xterm only
  // for a Managed session that's still running; otherwise — an Observed session running in another
  // terminal, or any Ended session (including a just-exited Managed one that re-derives Observed) — it's
  // the ObservedTerminal panel instead. A live Managed session opens on Terminal (transcriptOn = false);
  // everything else opens on Transcript (transcriptOn = true), since its read-only conversation leads.
  const hasLiveTerminal = s.management === "managed" && s.state !== "ended";
  const [transcriptOn, setTranscriptOn] = useState(!hasLiveTerminal);

  // Follow the live terminal when it stands up in place. Adopt resumes this same id, so Workspace never
  // remounts and `transcriptOn` keeps its seeded value, but `hasLiveTerminal` flips to true once the pty
  // is live. Switch only toward the terminal: a session ending shouldn't yank the user off the transcript
  // they were reading, and a manual toggle on a live session stays put.
  useEffect(() => {
    if (hasLiveTerminal) setTranscriptOn(false);
  }, [hasLiveTerminal]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950 text-fg">
      <MiddleHeader
        title={s.title}
        session={s}
        transcriptOn={transcriptOn}
        onToggleTranscript={() => setTranscriptOn((v) => !v)}
        leftEdgeExposed={leftEdgeExposed}
        rightEdgeExposed={rightEdgeExposed}
        menu={
          <SessionMenu
            session={s}
            canSpawn={canSpawn}
            onAdopt={onAdopt}
            onFork={onFork}
            onEnd={onEnd}
            onRename={onRename}
          />
        }
      />

      <div className="min-h-0 flex-1">
        <WorkspaceBody
          session={s}
          now={now}
          canSpawn={canSpawn}
          onAdopt={onAdopt}
          onFork={onFork}
          transcriptOn={transcriptOn}
          setTranscriptOn={setTranscriptOn}
        />
      </div>
    </div>
  );
}

/**
 * The workspace body: the center live view (terminal or transcript, per `transcriptOn`) with the Activity
 * dock below it. One transcript poll (useTranscript) feeds the center and the dock. The right-rail
 * telemetry panels have moved out to a sibling `RightSidebar` at the App level — this column is full width.
 */
function WorkspaceBody({
  session: s,
  now,
  canSpawn,
  onAdopt,
  onFork,
  transcriptOn,
  setTranscriptOn,
}: {
  session: Session;
  now: number;
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  transcriptOn: boolean;
  setTranscriptOn: (transcriptOn: boolean) => void;
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
    <div className="flex h-full min-h-0 flex-col">
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
          transcriptOn={transcriptOn}
          setTranscriptOn={setTranscriptOn}
        />
      </div>
      <ActivityDock
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
          setDrill([{ kind: "shell", shellId: shell.id, label: shell.command }])
        }
      />
    </div>
  );
}

/** The center column's live view. Every session gets the Claude Code ⇄ Transcript switcher in `MiddleHeader`;
 *  `transcriptOn` (lifted to `Workspace`, threaded down here) drives which side shows: off is the Terminal
 *  — the live xterm for a running Managed session, else the ObservedTerminal panel (Fork always, Adopt once
 *  Ended) — on is the Transcript, or the drilled Subagent/Shell surface when the drill-stack is non-empty.
 *  Drilling a lane or shell auto-selects the Transcript side. */
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
  transcriptOn,
  setTranscriptOn,
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
  transcriptOn: boolean;
  setTranscriptOn: (transcriptOn: boolean) => void;
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

  // Drilling into a lane or shell always surfaces its content in the Transcript side of the toggle.
  useEffect(() => {
    if (drilledKey) setTranscriptOn(true);
  }, [drilledKey, setTranscriptOn]);

  // The Terminal side is the live in-app xterm only for a Managed session that's still running;
  // otherwise — an Observed session running in another terminal, or any Ended session (including a
  // just-exited Managed one that re-derives Observed) — it's the ObservedTerminal panel: Fork is always
  // offered, Adopt only once the session has Ended.
  const hasLiveTerminal = s.management === "managed" && s.state !== "ended";
  const terminalSlot = hasLiveTerminal ? (
    <TerminalView sessionId={s.id} />
  ) : (
    <ObservedTerminal
      session={s}
      canSpawn={canSpawn}
      onAdopt={onAdopt}
      onFork={onFork}
    />
  );

  return (
    <div className="h-full min-h-0">
      {!transcriptOn ? (
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
  );
}

/** The scrolling transcript, shared by the Observed center and the Transcript side of the toggle. */
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
