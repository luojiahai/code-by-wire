import type { Subagent } from "@shared/types";
import { flattenSubagents } from "./panels/dock-tabs";

/** The handler bundle threaded through the shared TranscriptFeed: the dispatch index (a hit marks the id
 *  drillable) and the click that pushes the resolved Subagent onto the drill-stack. */
export type DispatchDrill = {
  index: ReadonlyMap<string, Subagent>;
  onDrill: (toolUseId: string) => void;
};

/** Index the nested subagent forest by each node's spawning dispatch id. The session transcript doc
 *  already carries the full nested forest, so this resolves an inline dispatch at any depth. Nodes
 *  without a dispatchId are skipped (they can never be a drill target); their children are still
 *  reached, since flattenSubagents walks every descendant. Pure: same input, same output. */
export function indexByDispatch(forest: Subagent[]): Map<string, Subagent> {
  const map = new Map<string, Subagent>();
  for (const n of flattenSubagents(forest))
    if (n.dispatchId) map.set(n.dispatchId, n);
  return map;
}
