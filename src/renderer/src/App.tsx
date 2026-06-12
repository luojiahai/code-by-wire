import { useEffect, useMemo, useState } from "react";
import type { Session, ModelId, Account } from "@shared/types";
import type { OverviewData } from "@shared/ipc";
import {
  mergeManaged,
  applyAdopting,
  renameManaged,
  renameAdopting,
} from "@shared/managed";
import { newSessionId } from "@shared/terminal";
import { groupSessions } from "@shared/overview";
import { Workspace } from "./workspace/Workspace";
import { NewSessionDialog } from "./terminal/NewSessionDialog";
import { terminalStore } from "./terminal/terminal-store-instance";
import { GlobalHeader } from "./ui/GlobalHeader";
import { SessionList } from "./SessionList";
import { Icon } from "./ui/icons";

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
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  // Sessions and account come from one overview read, so apply them together — a stale or failed
  // half can't leave the list and the account disagreeing.
  function applyOverview(o: OverviewData): void {
    setSessions(o.sessions);
    setAccount(o.account);
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

  // Drop an adopting override once discovery has relabeled its id Managed — the real row now carries the
  // live state, so the optimistic overlay is done.
  useEffect(() => {
    setAdopting((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const session of sessions)
        if (session.management === "managed") next.delete(session.id);
      return next.size === prev.size ? prev : next;
    });
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
      setAdopting((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, []);

  async function createSession(cwd: string, model: ModelId): Promise<void> {
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
    // Dispose any stale handle from a prior adopt of this id that has since ended (its buffer still holds
    // the old "[process exited]" scrollback), so a re-adopt starts on a fresh terminal.
    terminalStore.dispose(id);
    terminalStore.create(id);
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
      setAdopting((prev) => new Set(prev).add(id));
      setSelectedId(id);
    } catch (e) {
      terminalStore.dispose(id); // adopt refused or failed → nothing will feed this handle; don't leak it
      throw e;
    }
  }

  const all = useMemo(
    () => applyAdopting(mergeManaged(sessions, drafts), adopting),
    [sessions, drafts, adopting],
  );
  const selected =
    selectedId !== null ? (all.find((s) => s.id === selectedId) ?? null) : null;

  // The selection follows the unfiltered list, not the rail's `query` — filtering the rail must never
  // yank the open session away. Re-home only when the list first arrives, the open session vanishes, or
  // the list empties. Keyed on the id list so it can't loop on a fresh `all` each render; setting the
  // same id is a no-op.
  const ids = useMemo(() => all.map((s) => s.id).join(","), [all]);
  useEffect(() => {
    if (all.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (selectedId === null || !all.some((s) => s.id === selectedId)) {
      // Pick the rail's top row (Waiting → Working → Idle → Ended, recent first) so the auto-opened
      // session is the one visually at the top of the list, not an arbitrary first element of `all`.
      const ordered = groupSessions(all, "").flatMap((g) => g.items);
      setSelectedId((ordered[0] ?? all[0]).id);
    }
  }, [ids]);

  return (
    <div className="app-bg flex h-screen flex-col text-fg">
      <GlobalHeader />
      <div className="flex min-h-0 flex-1">
        <SessionList
          sessions={all}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setCreating(true)}
          query={query}
          onQuery={setQuery}
          account={account}
        />
        <div className="flex min-w-0 flex-1">
          {selected ? (
            <Workspace
              key={selected.id}
              session={selected}
              account={account}
              onAdopt={adoptSession}
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
