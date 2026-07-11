/// <reference lib="dom" />

/**
 * Shared file-drop helpers for both the Managed terminal (`terminal/TerminalView.tsx`) and the
 * footer shell terminal (`shell-terminal/use-terminal-session.ts`). Renderer-only, but kept free of
 * `window.api` so it also typechecks under `tsconfig.node.json` when a test imports it (that config
 * lacks the `Window.api` augmentation) — the path resolver is injected instead.
 */

/** True when the drag carries at least one file (so non-file drags pass through untouched). */
export function transferHasDropCandidates(t: DataTransfer): boolean {
  if ((t.files?.length ?? 0) > 0) return true;
  for (let i = 0; i < (t.items?.length ?? 0); i += 1) {
    if (t.items[i]?.kind === "file") return true;
  }
  return false;
}

/**
 * Resolve every dropped file to its absolute path via `resolvePath` (the renderer passes
 * `window.api.getPathForFile`), trimming, de-duplicating (insertion order), and dropping empties.
 * A file with no OS backing throws in the resolver and is silently skipped.
 */
export function collectDroppedPaths(
  t: DataTransfer,
  resolvePath: (file: File) => string,
): string[] {
  const seen = new Set<string>();
  const addFile = (file: File | null): void => {
    if (!file) return;
    try {
      const path = resolvePath(file);
      if (typeof path === "string" && path.trim()) seen.add(path.trim());
    } catch {
      // File handle unavailable.
    }
  };
  for (let i = 0; i < (t.files?.length ?? 0); i += 1) addFile(t.files.item(i));
  for (let i = 0; i < (t.items?.length ?? 0); i += 1) {
    const item = t.items[i];
    if (item?.kind === "file") addFile(item.getAsFile());
  }
  return [...seen];
}

/** POSIX single-quote a path: wrap in `'…'` and escape any embedded `'` as `'\''`. */
export function quotePosixPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}
