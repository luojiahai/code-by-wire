import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, Family, Account } from "@shared/types";
import type { CliStatus } from "@shared/cli-status";
import type { OverviewData } from "@shared/ipc";
import {
  mergeManaged,
  applyAdopting,
  applyEnding,
  pruneAdopting,
  pruneEnding,
  dropAdopting,
  dropEnding,
  renameManaged,
  renameAdopting,
} from "@shared/managed";
import { newSessionId } from "@shared/terminal";
import { orderedSessions } from "@shared/overview";
import { applyTitleOverrides } from "@shared/title-override";
import { Workspace } from "./workspace/Workspace";
import { NewSessionDialog } from "./terminal/NewSessionDialog";
import { terminalStore } from "./terminal/terminal-store-instance";
import { GlobalHeader } from "./ui/GlobalHeader";
import { CautionBanner } from "./ui/CautionBanner";
import { cliStatusView } from "./ui/cli-status-view";
import { SessionList } from "./SessionList";
import { spawnGate } from "./ui/cli-gating";
import { Icon } from "./ui/icons";
import { StatsView } from "./stats/StatsView";
import { OVERVIEW_ID } from "./stats/sentinel";
import { SettingsView, type SettingsSection } from "./settings/SettingsView";
import { SETTINGS_ID } from "./settings/sentinel";
import { useUpdate } from "./ui/use-update";

/** How often the session list re-syncs in the background, so an open workspace's state (and the
 *  Overview) tracks a session as it moves. Slower than the transcript poll: metadata changes less
 *  often than the conversation, and a sync re-walks ~/.claude. */
const SYNC_MS = 3000;

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  // Optimistic Managed sessions spawned this run that discovery hasn't indexed yet. Merged into the
  // list so a new session shows + opens immediately; pruned once its real row lands.
  const [drafts, setDrafts] = useState<Session[]>([]);
  // Ids adopted this run that discovery has not yet relabeled Managed. Overlaid by applyAdopting so the
  // adopted row reads Managed/Working immediately, until the next sync confirms it (or its pty exits).
  const [adopting, setAdopting] = useState<Set<string>>(new Set());
  // Ids ended this run that discovery has not yet relabeled. Overlaid by applyEnding so the row reads
  // Ended immediately — the header swaps End for Adopt and the workspace flips to the Transcript — until the
  // next sync confirms it.
  const [ending, setEnding] = useState<Set<string>>(new Set());
  // Display-name overrides for sessions renamed this run, keyed by id. Overlaid onto the not-yet-indexed
  // drafts the main process can't title (a draft has no SQLite row, so applyTitleOverrides in overviewNow
  // never sees it). Set adds the name, clear deletes it — so clearing a draft's rename reverts to its
  // derived title without the renderer ever having to know that title. Indexed rows are titled by main; this
  // only bridges the gap before discovery indexes the row.
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(
    {},
  );
  // Source ids with a fork in flight. The re-entrancy guard in useResumeAction is per-button-instance,
  // so it can't stop the two Fork buttons (header + terminal hero) — or a hero remounted by a tab
  // toggle — from each firing a fork of the same source before the awaits settle. Every fork mints its
  // own new id, which the manager's id-keyed idempotency can't dedupe, so without this a double-fire
  // spawns two divergent forks. Keyed by source id; cleared when the attempt settles.
  const forkingRef = useRef<Set<string>>(new Set());
  const [account, setAccount] = useState<Account | null>(null);
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  // The Settings sub-section to show. The Sys lamp jumps it to "system" (the CLI status home); the gear
  // reopens wherever the user last was.
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("system");
  // True while a CLI status check (Re-check, or saving a binary-path override) is in flight — drives the spinner.
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  // Land on Overview: the app opens to the all-time stats, not a session. The auto-select effect below
  // guards on `!isOverview`, so it never yanks this to a session on first load; the user clicks into a
  // session to leave it.
  const [selectedId, setSelectedId] = useState<string | null>(OVERVIEW_ID);
  const [creating, setCreating] = useState(false);
  const update = useUpdate();

  // Sessions and account come from one overview read, so apply them together — a stale or failed
  // half can't leave the list and the account disagreeing.
  function applyOverview(o: OverviewData): void {
    setSessions(o.sessions);
    setAccount(o.account);
    setCliStatus(o.cliStatus);
  }

  async function recheckCli(): Promise<void> {
    setChecking(true);
    try {
      setCliStatus(await window.api.recheckCli());
    } finally {
      setChecking(false);
    }
  }

  async function setClaudeBinPath(path: string | null): Promise<void> {
    setChecking(true);
    try {
      setCliStatus(await window.api.setClaudeBinPath(path));
    } finally {
      setChecking(false);
    }
  }

  async function load(): Promise<void> {
    setLoading(true);
    try {
      applyOverview(await window.api.overview());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Background re-sync so session state stays live. Silent (no loading spinner) and paused while the
  // window is hidden, so it doesn't burn a sweep nobody's looking at. On refocus the list could be a few
  // seconds stale, so we also fire one sync the moment the document becomes visible (replacing the old
  // manual Refresh button) and restart the timer so that focus sync and the next tick don't double-sweep
  // ~/.claude back to back. A single in-flight guard keeps overlapping syncs from applying out of order
  // — the same shape use-polled-read uses for the per-session polls.
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function silentSync(): Promise<void> {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const o = await window.api.refresh();
        if (alive) applyOverview(o);
      } catch {
        // Keep the last-known list; the next tick retries.
      } finally {
        inFlight = false;
      }
    }
    let timer = setInterval(() => void silentSync(), SYNC_MS);
    function onVisible(): void {
      if (document.hidden) return;
      clearInterval(timer);
      void silentSync();
      timer = setInterval(() => void silentSync(), SYNC_MS);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Drop a draft once discovery has indexed the real row for its id — the merged list then shows the
  // live row. The terminal keeps streaming throughout; it's driven by the pty, not by this row.
  useEffect(() => {
    setDrafts((ds) => ds.filter((d) => !sessions.some((s) => s.id === d.id)));
  }, [sessions]);

  // Drop an adopting override once discovery has caught up — the real row reads Managed AND no longer
  // Ended, so the optimistic overlay is done. Holding it until state leaves Ended bridges the boot window
  // where `claude --resume`'s pid hasn't landed yet (managed but still derives Ended); see pruneAdopting.
  useEffect(() => {
    setAdopting((prev) => pruneAdopting(prev, sessions));
  }, [sessions]);

  // Drop an ending override once discovery reports the row Ended (the killed pty's exit dropped its
  // managed-registry entry, so the next sync re-derives it Ended/Observed). Holding it until then bridges
  // the tick where the just-killed pid still reads alive; see pruneEnding.
  useEffect(() => {
    setEnding((prev) => pruneEnding(prev, sessions));
  }, [sessions]);

  // Follow a /clear rotation: the live pty kept running but Claude rotated its session id from `from` to
  // `to`. Migrate the terminal handle and re-point the open workspace onto `to`. Rename the row wherever it
  // lives — the discovered list once a sync has indexed it, OR the optimistic drafts when /clear lands
  // before any prompt (no sync has run, so the draft still carries `from`; left alone it would linger as a
  // phantom Working session with a dead terminal). An adopt override on `from` follows too, so a /clear
  // right after an Adopt doesn't strand the override and force `from`'s Ended ghost into a phantom. The next
  // sync then supersedes this overlay with the authoritative rows: the new id Managed, the old an Ended,
  // adoptable ghost.
  useEffect(() => {
    return window.api.terminal.onRename((from, to) => {
      terminalStore.rename(from, to);
      setSessions((ss) => renameManaged(ss, from, to));
      setDrafts((ds) => renameManaged(ds, from, to));
      setAdopting((prev) => renameAdopting(prev, from, to));
      setSelectedId((cur) => (cur === from ? to : cur));
    });
  }, []);

  // A draft discovery never indexes (the process died before writing a transcript) would otherwise sit at
  // 'working' forever; flip it to 'ended' on pty exit. Also drop any adopting override for that id, so a
  // resume that died reverts to the real (Ended/Observed) row instead of lying Managed.
  useEffect(() => {
    return window.api.terminal.onExit((id) => {
      setDrafts((ds) =>
        ds.map((d) => (d.id === id ? { ...d, state: "ended" } : d)),
      );
      setAdopting((prev) => dropAdopting(prev, id));
    });
  }, []);

  async function createSession(cwd: string, model: Family): Promise<void> {
    const gate = spawnGate(cliStatus);
    if (!gate.canSpawn) throw new Error(gate.reason ?? "CLI unavailable");
    // Mint the id here and stand the terminal up BEFORE spawning, so the very first pty bytes land on a
    // live handle. Rows match xterm's pre-fit default (80x24); the view's first fit corrects it.
    const id = newSessionId();
    terminalStore.create(id);
    try {
      const draft = await window.api.terminal.spawn({
        id,
        cwd,
        model,
        cols: 80,
        rows: 24,
      });
      setDrafts((ds) => [draft, ...ds]);
      setCreating(false);
      setSelectedId(id);
    } catch (e) {
      terminalStore.dispose(id); // spawn failed → nothing will ever feed this handle; don't leak it
      throw e; // surfaced by the dialog's catch
    }
  }

  // Adopt an Ended session: resume it in-app under its own id. Stand the terminal up first (so the first
  // resume bytes land on a live handle), then optimistically mark it adopting — management flips to
  // Managed and the workspace swaps to the live terminal — until the next sync confirms it.
  async function adoptSession(id: string): Promise<void> {
    const gate = spawnGate(cliStatus);
    if (!gate.canSpawn) throw new Error(gate.reason ?? "CLI unavailable");
    // Dispose any stale handle from a prior adopt of this id that has since ended (its buffer still holds
    // the old "[process exited]" scrollback), so a re-adopt starts on a fresh terminal.
    terminalStore.dispose(id);
    terminalStore.create(id);
    // Mark adopting BEFORE the await, not after. A resume that fails synchronously in main — a bad cwd
    // makes the manager fire the pty exit before this IPC even resolves — sends its exit while we're still
    // awaiting. Adding the override after the await would race that exit: its cleanup (onExit → dropAdopting)
    // runs while the id isn't in the set yet (a no-op), then we'd add an override nothing ever clears,
    // wedging the row at a phantom Managed/Working. Adding it first means a racing exit finds it and clears
    // it; the catch below clears it for a refused/errored adopt that never spawned a pty.
    setAdopting((prev) => new Set(prev).add(id));
    try {
      const result = await window.api.terminal.adopt({
        id,
        cols: 80,
        rows: 24,
      });
      if (!result.ok) {
        throw new Error(
          result.reason === "alive"
            ? "This session is alive again."
            : "Could not resume this session.",
        );
      }
      // A racing End click during this in-flight adopt may have added id to `ending`. The End button reads
      // `live` off the adopting overlay, so it shows before the pty exists — that kill no-oped, and the
      // revived row now reads alive, which pruneEnding never clears (it only drops on Ended). Drop the stale
      // override here, or it would pin this now-live session to a phantom Ended for the rest of the run.
      setEnding((prev) => dropEnding(prev, id));
      setSelectedId(id);
    } catch (e) {
      terminalStore.dispose(id); // adopt refused or failed → nothing will feed this handle; don't leak it
      setAdopting((prev) => dropAdopting(prev, id)); // and drop the optimistic override we set above
      throw e;
    }
  }

  // End a running Managed session: mark it ending (the optimistic overlay flips it to Ended at once) and
  // fire the existing fire-and-forget kill. No await and no result to handle — kill is best-effort on the
  // pty we own; the overlay plus the next sync reconcile the row to its real Ended/Observed state. Unlike
  // adopting, onExit does NOT clear the override: a killed row reads Ended anyway, so a stale id is inert,
  // and pruneEnding drops it once discovery indexes the row Ended. The one override that isn't inert is one
  // left on an id a racing Adopt then revives (its kill no-oped on a pty that didn't exist yet); adoptSession
  // clears that via dropEnding.
  function endSession(id: string): void {
    setEnding((prev) => new Set(prev).add(id));
    window.api.terminal.kill(id);
  }

  // Persist a display-name override for a session and apply the fresh overview the main process returns.
  // Mirror the change into the draft overlay first so a not-yet-indexed draft (which main can't title)
  // reflects the rename — or the clear — immediately; indexed rows reconcile from the overview the IPC
  // returns. Set and clear both converge: the overlay carries the derived title for drafts, the overview
  // carries it for indexed rows, so the renderer never has to know the derived title itself.
  async function renameSession(
    id: string,
    title: string | null,
  ): Promise<void> {
    setTitleOverrides((prev) => {
      const next = { ...prev };
      if (title) next[id] = title;
      else delete next[id];
      return next;
    });
    applyOverview(await window.api.renameSession(id, title));
  }

  // Fork a session: resume its conversation into a fresh id under `--fork-session`. Unlike Adopt (which
  // resumes the SAME id, so its row already exists in the list), a fork's id is brand new, so it follows
  // the spawn path: stand the terminal up first, then show the optimistic Managed draft main echoes back.
  // That draft is hydrated from zero usage with fresh timestamps (the same builder spawn uses), so the
  // fork never wears the source's accumulated cost/context/age; discovery then supersedes it with the
  // fork's own Transcript. The source's model rides in so the draft labels the right model up front.
  async function forkSession(source: Session): Promise<void> {
    const gate = spawnGate(cliStatus);
    if (!gate.canSpawn) throw new Error(gate.reason ?? "CLI unavailable");
    if (forkingRef.current.has(source.id)) return; // a fork of this source is already in flight
    forkingRef.current.add(source.id);
    const newId = newSessionId();
    terminalStore.create(newId);
    try {
      const result = await window.api.terminal.fork({
        sourceId: source.id,
        newId,
        model: source.model,
        cols: 80,
        rows: 24,
      });
      if (!result.ok) throw new Error("Could not fork this session.");
      setDrafts((ds) => [result.session, ...ds]);
      setSelectedId(newId);
    } catch (e) {
      terminalStore.dispose(newId); // fork refused or failed → nothing feeds this handle; don't leak it
      throw e;
    } finally {
      forkingRef.current.delete(source.id);
    }
  }

  const all = useMemo(
    () =>
      applyEnding(
        applyAdopting(
          // Title the drafts here, not the merged list: a real indexed row already carries its override
          // from main, and re-overlaying it would re-expose a stale title on clear (main's row updates a
          // sync later than this map). Drafts are the only rows main can't reach.
          mergeManaged(sessions, applyTitleOverrides(drafts, titleOverrides)),
          adopting,
        ),
        ending,
      ),
    [sessions, drafts, adopting, ending, titleOverrides],
  );
  const isOverview = selectedId === OVERVIEW_ID;
  const isSettings = selectedId === SETTINGS_ID;
  // Both pinned views (Overview, Settings) are non-session selections: the per-session lookup and the
  // auto-select effect must treat them as valid, never as a stale/missing session to re-home.
  const isPinned = isOverview || isSettings;
  const selected =
    !isPinned && selectedId !== null
      ? (all.find((s) => s.id === selectedId) ?? null)
      : null;

  // Re-home the selection only when the list first arrives, the open session vanishes, or the list
  // empties. Keyed on the id list so it can't loop on a fresh `all` each render; setting the same id is
  // a no-op.
  const ids = useMemo(() => all.map((s) => s.id).join(","), [all]);
  useEffect(() => {
    if (all.length === 0) {
      // The pinned views (Overview, Settings) are valid even with no sessions (Overview shows the empty
      // state); only clear a stale *session* selection.
      if (selectedId !== null && !isPinned) setSelectedId(null);
      return;
    }
    if (
      !isPinned &&
      (selectedId === null || !all.some((s) => s.id === selectedId))
    ) {
      // Pick the rail's top row (Active newest-created first, then Ended) so the auto-opened session
      // is the one visually at the top of the list, not an arbitrary first element of `all`.
      const ordered = orderedSessions(all, "");
      setSelectedId((ordered[0] ?? all[0]).id);
    }
  }, [ids]);

  const showSystem = (): void => {
    setSettingsSection("system");
    setSelectedId(SETTINGS_ID);
  };
  // The master-caution strip shows whenever the CLI is non-ok, except while already in Settings (the strip
  // deep-links there) and during the pre-first-check window (no status to judge yet).
  const showCaution =
    cliStatus !== null && !isSettings && cliStatusView(cliStatus).tone !== "ok";

  return (
    <div className="app-bg flex h-screen flex-col text-fg">
      <GlobalHeader
        cliStatus={cliStatus}
        onOpenSettings={() => setSelectedId(SETTINGS_ID)}
        settingsActive={isSettings}
        updatePhase={update.state.phase.kind}
      />
      {showCaution && cliStatus && (
        <CautionBanner status={cliStatus} onOpenSystem={showSystem} />
      )}
      <div className="flex min-h-0 flex-1">
        <SessionList
          sessions={all}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setCreating(true)}
          account={account}
          canSpawn={spawnGate(cliStatus).canSpawn}
        />
        <div className="flex min-w-0 flex-1">
          {isSettings ? (
            <SettingsView
              cliStatus={cliStatus}
              account={account}
              checking={checking}
              onRecheck={() => void recheckCli()}
              onSetBinPath={(p) => void setClaudeBinPath(p)}
              section={settingsSection}
              onSectionChange={setSettingsSection}
              update={update}
            />
          ) : isOverview ? (
            <StatsView />
          ) : selected ? (
            <Workspace
              key={selected.id}
              session={selected}
              account={account}
              canSpawn={spawnGate(cliStatus).canSpawn}
              onAdopt={adoptSession}
              onFork={forkSession}
              onEnd={endSession}
              onRename={(id, title) => void renameSession(id, title)}
            />
          ) : (
            <EmptyDetail empty={all.length === 0} loading={loading} />
          )}
        </div>
      </div>
      {creating && (
        <NewSessionDialog
          onCreate={createSession}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/** The detail pane before a session is selected, or when none exist. */
function EmptyDetail({ empty, loading }: { empty: boolean; loading: boolean }) {
  if (empty) {
    return (
      <div className="flex flex-1 items-center justify-center bg-ink-950 text-[13px] text-fg-faint">
        {loading ? null : "No Claude Code sessions found."}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 bg-ink-950 text-fg-faint">
      <Icon name="square-dashed-mouse-pointer" size={28} />
      <p className="text-[13px]">Select a session to open it.</p>
    </div>
  );
}
