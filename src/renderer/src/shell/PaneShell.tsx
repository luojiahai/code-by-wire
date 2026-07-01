import {
  Children,
  isValidElement,
  useMemo,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { useStore } from "@nanostores/react";
import { cx } from "../ui/atoms";
import { $paneStates } from "./panes";
import {
  PaneShellContext,
  type PaneShellContextValue,
  type PaneSide,
  type PaneSlot,
} from "./pane-shell-context";
import type { PaneProps } from "./Pane";

interface CollectedPane {
  id: string;
  side: PaneSide;
  width: number;
  hoverReveal: boolean;
  disabled: boolean;
  forceCollapsed: boolean;
}

function collectPanes(children: ReactNode): {
  left: CollectedPane[];
  right: CollectedPane[];
} {
  const left: CollectedPane[] = [];
  const right: CollectedPane[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const p = (child as ReactElement<PaneProps>).props;
    if (
      !p ||
      typeof p.id !== "string" ||
      (p.side !== "left" && p.side !== "right")
    )
      continue;
    const entry: CollectedPane = {
      id: p.id,
      side: p.side,
      width: p.width ?? 248,
      hoverReveal: Boolean(p.hoverReveal),
      disabled: Boolean(p.disabled),
      forceCollapsed: Boolean(p.forceCollapsed),
    };
    (p.side === "left" ? left : right).push(entry);
  }
  return { left, right };
}

export function PaneShell({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const paneStates = useStore($paneStates);
  const { left, right } = useMemo(() => collectPanes(children), [children]);

  const ctx = useMemo(() => {
    const paneById = new Map<string, PaneSlot>();
    const tracks: string[] = [];
    const cssVars: Record<string, string> = {};
    let column = 1;
    const addColumn = (pane: CollectedPane) => {
      const snap = paneStates[pane.id];
      const open =
        Boolean(snap?.open) && !pane.disabled && !pane.forceCollapsed;
      const track = open ? `${snap?.widthOverride ?? pane.width}px` : "0px";
      tracks.push(track);
      cssVars[`--pane-${pane.id}-width`] = track;
      paneById.set(pane.id, {
        open,
        side: pane.side,
        gridColumn: `${column} / ${column + 1}`,
      });
      column++;
    };
    for (const pane of left) addColumn(pane);
    tracks.push("minmax(0,1fr)");
    const mainColumn = column++;
    for (const pane of right) addColumn(pane);
    return { cssVars, gridTemplate: tracks.join(" "), mainColumn, paneById };
  }, [left, right, paneStates]);

  const composedStyle = useMemo<CSSProperties>(
    () => ({
      ...ctx.cssVars,
      ...style,
      gridTemplateColumns: ctx.gridTemplate,
      gridTemplateRows: "minmax(0,1fr)",
    }),
    [ctx.cssVars, ctx.gridTemplate, style],
  );

  const value: PaneShellContextValue = {
    mainColumn: ctx.mainColumn,
    paneById: ctx.paneById,
  };
  return (
    <PaneShellContext.Provider value={value}>
      <div
        className={cx("relative grid h-full min-h-0", className)}
        style={composedStyle}
      >
        {children}
      </div>
    </PaneShellContext.Provider>
  );
}
