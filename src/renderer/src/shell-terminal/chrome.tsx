import { useStore } from "@nanostores/react";
import { TerminalSlot } from "./persistent";
import { TerminalRail } from "./rail";
import { $terminals } from "./terminals";

/** Pane-side terminal chrome: the body slot (which the persistent overlay chases) plus the
 *  always-on tab rail. Lives in the real pane DOM — not the z-4 overlay — so the rail keeps its
 *  own stacking. The rail shows whenever a terminal exists (even one), so every tab keeps its
 *  close affordance; closing the last one hides the pane.
 *
 *  Row-mode's top seam is NOT drawn here: the pane's resize sash paints a full-bleed hairline
 *  above the rail's z-40 (see the terminal Pane's `divider` in App.tsx). */
export function TerminalPaneChrome() {
  const terminals = useStore($terminals);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TerminalSlot />
      </div>
      {terminals.length > 0 && <TerminalRail />}
    </div>
  );
}
