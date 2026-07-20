export const PROJECT_MENU_WIDTH = 256;
const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 6;

export function placeProjectMenu(
  trigger: Pick<DOMRect, "left" | "top" | "bottom">,
  viewport: { width: number; height: number },
  menuHeight: number,
): { left: number; top: number } {
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(
      trigger.left,
      viewport.width - PROJECT_MENU_WIDTH - VIEWPORT_GUTTER,
    ),
  );
  const below = trigger.bottom + TRIGGER_GAP;
  const above = trigger.top - TRIGGER_GAP - menuHeight;
  const top =
    below + menuHeight <= viewport.height - VIEWPORT_GUTTER
      ? below
      : above >= VIEWPORT_GUTTER
        ? above
        : Math.max(
            VIEWPORT_GUTTER,
            Math.min(below, viewport.height - menuHeight - VIEWPORT_GUTTER),
          );
  return { left, top };
}
