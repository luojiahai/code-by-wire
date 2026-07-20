import type { ProjectPlacement, ProjectState } from "@shared/ipc";

export function projectPlacementMatches(
  state: ProjectState,
  key: string,
  placement: ProjectPlacement,
): boolean {
  const entry = state[key];
  const pinned = entry?.pinnedAtMs !== undefined;
  const hidden = entry?.hiddenAtMs !== undefined;
  if (placement === "pinned") return pinned && !hidden;
  if (placement === "hidden") return hidden && !pinned;
  return !pinned && !hidden;
}

export async function runProjectPlacementAction(
  setPlacement: (placement: ProjectPlacement) => Promise<void>,
  placement: ProjectPlacement,
  close: () => void,
): Promise<void> {
  await setPlacement(placement);
  close();
}
