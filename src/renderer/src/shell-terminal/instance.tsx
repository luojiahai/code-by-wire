import "@xterm/xterm/css/xterm.css";
import { cx } from "../ui/atoms";
import { reportTerminalShell } from "./terminals";
import { useTerminalSession } from "./use-terminal-session";

// Absolute-stacked so inactive tabs keep layout size (a display:none host goes 0×0 and renders
// garbled on re-show); visibility toggles which one is seen.
// bg-(--terminal-editor-surface-background), not the App-themed --ui-editor-surface-background: even
// with no padding of its own, this div's background can show through xterm's own 8px inset (the
// hostRef div below fills it edge-to-edge, so only xterm's own padding — set in index.css's
// `.xterm.xterm` rule — creates any visible gap), so it still follows Terminal theme, not App theme.
const INSTANCE_CLASS =
  "absolute inset-0 flex flex-col bg-(--terminal-editor-surface-background)";

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
          the content area and the padding stays as terminal padding. `relative` is load-bearing:
          xterm.js's own CSS makes .xterm position:absolute/inset — with a static host, that skips
          straight to this outer (already-positioned) div, so .xterm's box ends up the OUTER div's
          full size while the resize math (which measures THIS div's clientWidth/Height, already
          narrowed by the outer div's own padding) assumes a smaller box — double-counting the outer
          padding and stranding a phantom gap on the trailing/bottom edges. Making this div the
          positioned ancestor .xterm actually binds to keeps both in agreement. */}
      <div
        className="relative h-full min-h-0 overflow-hidden text-(--ui-text-secondary) [&_.xterm]:h-full [&_.xterm-screen]:bg-(--terminal-editor-surface-background)! [&_.xterm-viewport]:bg-(--terminal-editor-surface-background)!"
        ref={hostRef}
      />
    </div>
  );
}
