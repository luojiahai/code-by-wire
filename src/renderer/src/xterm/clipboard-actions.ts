import type { OsKind } from "@shared/platform";
import {
  preparePasteText,
  rightClickAction,
  type ClipboardKeyAction,
} from "./clipboard-keys";

/** The xterm slice the clipboard actions touch. Declared structurally so a real `@xterm/xterm`
 *  Terminal satisfies it (its `modes` object carries more fields) AND a test fake can stand in. */
export interface ClipboardTermLike {
  hasSelection(): boolean;
  getSelection(): string;
  clearSelection(): void;
  /** Feed text through xterm's paste path (bracketed-paste wrapping, \n → \r normalization). */
  paste(data: string): void;
  focus(): void;
  readonly modes: { readonly bracketedPasteMode: boolean };
}

/** The main-process clipboard IPC pair (window.api.clipboardReadText / clipboardWriteText),
 *  injected so the stores and tests never touch `window`. */
export interface ClipboardIpc {
  readText(type?: "selection"): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface ClipboardActionDeps {
  term: ClipboardTermLike;
  /** Renderer → pty bytes — the ^V image-paste fallback. Callers close over their live session
   *  id (the Claude terminal reads handle.id so a /clear rename re-points it). */
  writePty: (data: string) => void;
  clipboard: ClipboardIpc;
}

/**
 * Execute a clipboard verdict from clipboard-keys. Fired as `void runClipboardAction(...)` from
 * sync event handlers, so it NEVER rejects: any clipboard IPC failure is a silent no-op. In
 * particular the ^V fallback only fires on a SUCCESSFUL read that returns empty text (a
 * screenshot — or nothing — on the clipboard); an IPC hiccup must never type a stray control
 * byte into the prompt.
 */
export async function runClipboardAction(
  action: ClipboardKeyAction,
  deps: ClipboardActionDeps,
): Promise<void> {
  const { term, clipboard } = deps;
  try {
    if (action === "copy" || action === "copy-and-clear") {
      const selection = term.getSelection();
      if (!selection) return; // unreachable via the dispatchers (hasSelection gates); guarded anyway
      await clipboard.writeText(selection);
      if (action === "copy-and-clear") term.clearSelection();
      return;
    }
    const text = await clipboard.readText(
      action === "paste-selection" ? "selection" : undefined,
    );
    if (text.length === 0) {
      // Successful read, no text. Only the Ctrl+V trigger hands the CLI its ^V byte — the
      // Claude CLI binds it to "paste image from clipboard", and \x16 is exactly what xterm
      // would have sent had we not intercepted. Other triggers natively send nothing.
      if (action === "paste") deps.writePty("\x16");
      return;
    }
    const prepared = preparePasteText(text, term.modes.bracketedPasteMode);
    if (prepared !== null) term.paste(prepared);
  } catch {
    // Clipboard IPC failure — no-op by design (see doc comment).
  }
}

/** Wire VS Code's Windows right-click copyPaste onto a terminal's mount element. Returns the
 *  detach cleanup. On non-Windows platforms the listener still attaches but every event returns
 *  null from rightClickAction, leaving the browser default untouched. */
export function attachClipboardContextMenu(
  el: Pick<HTMLElement, "addEventListener" | "removeEventListener">,
  os: OsKind,
  deps: ClipboardActionDeps,
): () => void {
  const onContextMenu = (e: MouseEvent): void => {
    const action = rightClickAction(os, deps.term.hasSelection(), e.shiftKey);
    if (action === null) return;
    e.preventDefault();
    if (action === "paste-no-fallback") deps.term.focus(); // vscode focuses before a mouse paste
    void runClipboardAction(action, deps);
  };
  el.addEventListener("contextmenu", onContextMenu);
  return () => el.removeEventListener("contextmenu", onContextMenu);
}
