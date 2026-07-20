import type { ProjectPlacement } from "@shared/ipc";

export async function runProjectPlacementAction(
  setPlacement: (placement: ProjectPlacement) => Promise<void>,
  placement: ProjectPlacement,
  close: () => void,
): Promise<void> {
  await setPlacement(placement);
  close();
}
