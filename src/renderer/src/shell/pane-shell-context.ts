import { createContext } from "react";
export type PaneSide = "left" | "right";
export interface PaneSlot {
  open: boolean;
  side: PaneSide;
  gridColumn: string;
}
export interface PaneShellContextValue {
  mainColumn: number;
  paneById: Map<string, PaneSlot>;
}
export const PaneShellContext = createContext<PaneShellContextValue | null>(
  null,
);
