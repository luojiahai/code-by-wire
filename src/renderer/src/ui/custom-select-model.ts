export interface SelectOptionState {
  disabled?: boolean;
}

export interface VerticalBounds {
  top: number;
  bottom: number;
}

export interface MenuPlacement {
  side: "above" | "below";
  maxHeight: number;
}

export function intersectVerticalBounds(
  current: VerticalBounds,
  next: VerticalBounds,
): VerticalBounds {
  return {
    top: Math.max(current.top, next.top),
    bottom: Math.min(current.bottom, next.bottom),
  };
}

export function menuPlacement({
  triggerTop,
  triggerBottom,
  boundaryTop,
  boundaryBottom,
  menuHeight,
  gap,
}: {
  triggerTop: number;
  triggerBottom: number;
  boundaryTop: number;
  boundaryBottom: number;
  menuHeight: number;
  gap: number;
}): MenuPlacement {
  const spaceBelow = Math.max(0, boundaryBottom - triggerBottom - gap);
  const spaceAbove = Math.max(0, triggerTop - boundaryTop - gap);
  const side =
    menuHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  return {
    side,
    maxHeight: side === "above" ? spaceAbove : spaceBelow,
  };
}

export function firstEnabledIndex(
  options: readonly SelectOptionState[],
): number {
  return options.findIndex((option) => !option.disabled);
}

export function lastEnabledIndex(
  options: readonly SelectOptionState[],
): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function selectedOrFirstEnabledIndex(
  options: readonly SelectOptionState[],
  selectedIndex: number,
): number {
  return selectedIndex >= 0 &&
    selectedIndex < options.length &&
    !options[selectedIndex].disabled
    ? selectedIndex
    : firstEnabledIndex(options);
}

export function moveEnabledIndex(
  options: readonly SelectOptionState[],
  currentIndex: number,
  direction: -1 | 1,
): number {
  if (firstEnabledIndex(options) === -1) return -1;
  let index = currentIndex;
  for (let count = 0; count < options.length; count += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}
