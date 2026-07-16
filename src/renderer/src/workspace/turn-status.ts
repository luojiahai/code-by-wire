import type { ToolEvent } from "@shared/transcript";
import type { Translations } from "../i18n";

/** The glyph and tone for a transcript turn's result status — locale-invariant, so these two fields stay
 *  in a module-scope table. The status word is resolved fresh per call by `turnStatus` (never captured
 *  here), so it follows the active locale. Tool and diff events share the same status union. */
const TURN_STATUS_GLYPH: Record<
  ToolEvent["status"],
  { char: string; tone: string }
> = {
  ok: { char: "✓", tone: "text-ok" },
  error: { char: "✕", tone: "text-danger" },
  pending: { char: "●", tone: "text-working-bright" },
};

/** The glyph, translated label, and color tone for a transcript turn's result status. One function
 *  shared by the tool and edit rows (which show the glyph) and their detail modals (which show the
 *  label), so ok / error / pending look the same everywhere. */
export function turnStatus(
  status: ToolEvent["status"],
  t: Translations,
): { char: string; label: string; tone: string } {
  return { ...TURN_STATUS_GLYPH[status], label: t.modals.turnStatus[status] };
}
