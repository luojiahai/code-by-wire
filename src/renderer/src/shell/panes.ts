import { atom, computed, type ReadableAtom } from "nanostores";

export interface PaneStateSnapshot {
  open: boolean;
  widthOverride?: number;
}
export interface PaneRegisterDefaults {
  open: boolean;
  widthOverride?: number;
}

const STORAGE_KEY = "cbw.paneStates.v1";

function isSnapshot(v: unknown): v is PaneStateSnapshot {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as PaneStateSnapshot).open === "boolean"
  );
}

function load(): Record<string, PaneStateSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const out: Record<string, PaneStateSnapshot> = {};
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (isSnapshot(v))
          out[id] = { open: v.open, widthOverride: v.widthOverride };
      }
      return out;
    }
  } catch {
    /* unparseable → empty */
  }
  return {};
}

function persist(states: Record<string, PaneStateSnapshot>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    /* nonfatal */
  }
}

export const $paneStates = atom<Record<string, PaneStateSnapshot>>(load());
$paneStates.subscribe(persist);

function memoized<T>(
  cache: Map<string, ReadableAtom<T>>,
  id: string,
  sel: (s: PaneStateSnapshot | undefined) => T,
) {
  let c = cache.get(id);
  if (!c) {
    c = computed($paneStates, (states) => sel(states[id]));
    cache.set(id, c);
  }
  return c;
}
const openCache = new Map<string, ReadableAtom<boolean>>();
const widthCache = new Map<string, ReadableAtom<number | undefined>>();
export const $paneOpen = (id: string) =>
  memoized(openCache, id, (s) => s?.open ?? false);
export const $paneWidthOverride = (id: string) =>
  memoized(widthCache, id, (s) => s?.widthOverride);

export function ensurePaneRegistered(
  id: string,
  d: PaneRegisterDefaults,
): void {
  const cur = $paneStates.get();
  if (cur[id] !== undefined) return;
  $paneStates.set({
    ...cur,
    [id]: { open: d.open, widthOverride: d.widthOverride },
  });
}
export function setPaneOpen(id: string, open: boolean): void {
  const cur = $paneStates.get();
  const ex = cur[id];
  if (ex?.open === open) return;
  $paneStates.set({ ...cur, [id]: { ...ex, open } });
}
export function togglePane(id: string): void {
  const cur = $paneStates.get();
  const ex = cur[id];
  $paneStates.set({ ...cur, [id]: { ...ex, open: !(ex?.open ?? false) } });
}
export function setPaneWidthOverride(
  id: string,
  width: number | undefined,
): void {
  const cur = $paneStates.get();
  const ex = cur[id] ?? { open: false };
  if (ex.widthOverride === width) return;
  $paneStates.set({ ...cur, [id]: { ...ex, widthOverride: width } });
}
export const clearPaneWidthOverride = (id: string) =>
  setPaneWidthOverride(id, undefined);
