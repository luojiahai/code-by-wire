const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 6;

export function placeAnchoredMenu(
  trigger: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  viewport: { width: number; height: number },
  menu: { width: number; height: number },
  align: "start" | "end",
): { left: number; top: number } {
  const anchorLeft =
    align === "end" ? trigger.right - menu.width : trigger.left;
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(anchorLeft, viewport.width - menu.width - VIEWPORT_GUTTER),
  );
  const below = trigger.bottom + TRIGGER_GAP;
  const above = trigger.top - TRIGGER_GAP - menu.height;
  const top =
    below + menu.height <= viewport.height - VIEWPORT_GUTTER
      ? below
      : above >= VIEWPORT_GUTTER
        ? above
        : Math.max(
            VIEWPORT_GUTTER,
            Math.min(below, viewport.height - menu.height - VIEWPORT_GUTTER),
          );
  return { left, top };
}
