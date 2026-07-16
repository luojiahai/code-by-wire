import { atom } from "nanostores";
import { tNow } from "../i18n";
import { $activeSessionCwd, setTerminalTakeover } from "./store";

/** One in-app terminal tab. `id` is the renderer-side handle — distinct from the pty session id
 *  the hook mints per shell; each instance owns its own shell. */
export interface TerminalEntry {
  id: string;
  /** Display label. `auto` adopts the resolved shell name until the user renames. */
  title: string;
  auto: boolean;
  /** Working directory, snapshotted once at creation. Terminals live outside session state — the
   *  only thing they inherit is this initial cwd; switching sessions never moves or recreates one. */
  cwd: string;
  /** Serialized xterm scrollback from the last run, replayed on relaunch so the tab reopens with
   *  its recent history (VS Code parity). Processes are NOT revived — a fresh shell starts beneath
   *  the restored buffer. */
  reviveBuffer?: string;
}

const TERMINALS_STORAGE_KEY = "cbw.terminals.v1";

/** Cap a single tab's replayed history so the persisted list can't blow the localStorage quota. */
export const MAX_REVIVE_BUFFER_CHARS = 48_000;

interface PersistedState {
  activeTerminalId: string | null;
  terminals: TerminalEntry[];
}

function sanitize(value: unknown): TerminalEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const reviveBuffer =
    typeof r.reviveBuffer === "string" ? r.reviveBuffer : undefined;
  return {
    id,
    title: title || tNow().terminal.defaultTitle,
    auto: typeof r.auto === "boolean" ? r.auto : true,
    cwd: typeof r.cwd === "string" ? r.cwd : "",
    ...(reviveBuffer ? { reviveBuffer } : {}),
  };
}

function load(): PersistedState {
  const fallback: PersistedState = { activeTerminalId: null, terminals: [] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TERMINALS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return fallback;
    const record = parsed as Record<string, unknown>;
    const terminals = Array.isArray(record.terminals)
      ? record.terminals
          .map(sanitize)
          .filter((t): t is TerminalEntry => Boolean(t))
      : [];
    const active =
      typeof record.activeTerminalId === "string" &&
      terminals.some((t) => t.id === record.activeTerminalId)
        ? record.activeTerminalId
        : (terminals[0]?.id ?? null);
    return { activeTerminalId: active, terminals };
  } catch {
    return fallback;
  }
}

// Persist synchronously on every change (the app-wide convention — see panes.ts). Capturing
// history this way means a snapshot is already on disk before the renderer tears down, so app
// quit needs no unload hook.
function persist(
  list: readonly TerminalEntry[],
  activeId: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!list.length) {
      window.localStorage.removeItem(TERMINALS_STORAGE_KEY);
      return;
    }
    const active = list.some((t) => t.id === activeId)
      ? activeId
      : (list[0]?.id ?? null);
    window.localStorage.setItem(
      TERMINALS_STORAGE_KEY,
      JSON.stringify({ activeTerminalId: active, terminals: list }),
    );
  } catch {
    // Storage failures are nonfatal.
  }
}

const restored = load();

export const $terminals = atom<readonly TerminalEntry[]>(restored.terminals);
export const $activeTerminalId = atom<string | null>(restored.activeTerminalId);

$terminals.subscribe((list) => persist(list, $activeTerminalId.get()));
$activeTerminalId.subscribe((active) => persist($terminals.get(), active));

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Append a fresh terminal and focus it. Captures the current session cwd once; pass an explicit
 *  cwd to override. Returns the tab id. */
export function createTerminal(
  cwd: string = $activeSessionCwd.get() ?? "",
): string {
  const id = newId();
  $terminals.set([
    ...$terminals.get(),
    { id, title: tNow().terminal.defaultTitle, auto: true, cwd },
  ]);
  $activeTerminalId.set(id);
  return id;
}

/** Guarantee at least one tab exists when the pane opens. */
export function ensureTerminal(): void {
  if ($terminals.get().length === 0) createTerminal();
}

export function selectTerminal(id: string): void {
  if ($terminals.get().some((t) => t.id === id)) $activeTerminalId.set(id);
}

/** Move the active tab by `direction` (+1 next / -1 prev), wrapping around. */
export function cycleTerminal(direction: 1 | -1): void {
  const list = $terminals.get();
  if (list.length < 2) return;
  const current = Math.max(
    0,
    list.findIndex((t) => t.id === $activeTerminalId.get()),
  );
  $activeTerminalId.set(
    list[(current + direction + list.length) % list.length].id,
  );
}

/** Drop a terminal. Focus slides to the neighbor that fills its slot; closing the last one hides
 *  the whole pane. */
export function closeTerminal(id: string): void {
  const list = $terminals.get();
  const index = list.findIndex((t) => t.id === id);
  if (index < 0) return;
  const next = list.filter((t) => t.id !== id);
  $terminals.set(next);
  if ($activeTerminalId.get() === id) {
    $activeTerminalId.set((next[index] ?? next[index - 1])?.id ?? null);
  }
  if (!next.length) setTerminalTakeover(false);
}

export function closeActiveTerminal(): void {
  const id = $activeTerminalId.get();
  if (id) closeTerminal(id);
}

export function closeAllTerminals(): void {
  if ($terminals.get().length === 0) return;
  $terminals.set([]);
  $activeTerminalId.set(null);
  setTerminalTakeover(false);
}

export function closeOtherTerminals(id: string): void {
  const keep = $terminals.get().find((t) => t.id === id);
  if (keep) {
    $terminals.set([keep]);
    $activeTerminalId.set(keep.id);
  }
}

/** Record the latest serialized scrollback for a tab, tail-trimmed to the storage budget. */
export function updateTerminalReviveBuffer(
  id: string,
  reviveBuffer: string,
): void {
  const capped =
    reviveBuffer.length > MAX_REVIVE_BUFFER_CHARS
      ? reviveBuffer.slice(-MAX_REVIVE_BUFFER_CHARS)
      : reviveBuffer;
  $terminals.set(
    $terminals
      .get()
      .map((t) => (t.id === id ? { ...t, reviveBuffer: capped } : t)),
  );
}

export function renameTerminal(id: string, title: string): void {
  const trimmed = title.trim();
  $terminals.set(
    $terminals
      .get()
      .map((t) =>
        t.id === id ? { ...t, title: trimmed || t.title, auto: false } : t,
      ),
  );
}

/** A live terminal reports its resolved shell; adopt it as the label only while the user hasn't
 *  named the tab themselves. */
export function reportTerminalShell(id: string, shell: string): void {
  const name = shell.trim();
  if (!name) return;
  $terminals.set(
    $terminals
      .get()
      .map((t) => (t.id === id && t.auto ? { ...t, title: name } : t)),
  );
}
