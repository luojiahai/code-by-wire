import type { Management } from "@shared/types";

export interface ModeInfo {
  kind: Management;
  /** The header word and popover title. */
  label: string;
  /** One line of plain-language copy shown in the popover. */
  blurb: string;
}

/** The Managed/Observed legend. Lives JSX-free so the copy is unit-tested and the header popover and any
 *  future caller share one source of truth. */
export const MODE_INFO: Record<Management, ModeInfo> = {
  managed: {
    kind: "managed",
    label: "Managed",
    blurb:
      "Spawned and driven by Code-by-wire. You can send input, interrupt it, and end it from here.",
  },
  observed: {
    kind: "observed",
    label: "Observed",
    blurb:
      "Running in another terminal or machine. Code-by-wire mirrors its transcript read-only. You can't type in. Adopt it to take the wheel.",
  },
};

/** Popover display order: managed first, so the legend is stable regardless of the current session. */
export const MODE_ORDER: readonly Management[] = ["managed", "observed"];
