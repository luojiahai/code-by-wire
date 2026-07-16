import type { Management } from "@shared/types";
import { tNow, type Translations } from "../i18n";

export interface ModeInfo {
  kind: Management;
  /** The header word and popover title. */
  label: string;
  /** One line of plain-language copy shown in the popover. */
  blurb: string;
}

/** The Managed/Observed legend. Lives JSX-free so the copy is unit-tested and the header popover and any
 *  future caller share one source of truth. `t` defaults to the live locale via `tNow()` — resolved fresh
 *  per call, never captured at module scope, so a language switch reaches this table too. */
export function modeInfo(
  t: Translations = tNow(),
): Record<Management, ModeInfo> {
  return {
    managed: {
      kind: "managed",
      label: t.workspace.mode.managed.label,
      blurb: t.workspace.mode.managed.blurb,
    },
    observed: {
      kind: "observed",
      label: t.workspace.mode.observed.label,
      blurb: t.workspace.mode.observed.blurb,
    },
  };
}

/** Popover display order: managed first, so the legend is stable regardless of the current session. */
export const MODE_ORDER: readonly Management[] = ["managed", "observed"];
