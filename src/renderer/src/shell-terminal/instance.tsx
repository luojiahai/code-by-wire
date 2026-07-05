import "@xterm/xterm/css/xterm.css";
import { cx } from "../ui/atoms";
import { reportTerminalShell } from "./terminals";
import { useTerminalSession } from "./use-terminal-session";

// Absolute-stacked so inactive tabs keep layout size (a display:none host goes 0×0 and renders
// garbled on re-show); visibility toggles which one is seen.
const INSTANCE_CLASS =
  "absolute inset-0 flex flex-col bg-(--ui-editor-surface-background) px-2 pb-2 pt-0";

/** One persistent xterm+pty. Every open tab stays mounted (its shell and scrollback survive tab
 *  switches); only the active one is shown. */
export function TerminalInstance({
  id,
  active,
  cwd,
  reviveBuffer,
}: {
  id: string;
  active: boolean;
  cwd: string;
  reviveBuffer?: string;
}) {
  const { hostRef } = useTerminalSession({
    id,
    cwd,
    active,
    reviveBuffer,
    onShell: (shell) => reportTerminalShell(id, shell),
  });

  return (
    <div
      className={cx(
        INSTANCE_CLASS,
        active ? "visible" : "invisible pointer-events-none",
      )}
      data-terminal=""
    >
      {/* Outer div paints the terminal inset; inner div is the xterm host so the canvas sizes to
          the content area and the padding stays as terminal padding. */}
      <div
        className="h-full min-h-0 overflow-hidden text-(--ui-text-secondary) [&_.xterm]:h-full [&_.xterm-screen]:bg-(--ui-editor-surface-background)! [&_.xterm-viewport]:bg-(--ui-editor-surface-background)!"
        ref={hostRef}
      />
    </div>
  );
}
