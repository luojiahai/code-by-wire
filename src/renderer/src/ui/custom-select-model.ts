export interface SelectOptionState {
  disabled?: boolean;
}

export function firstEnabledIndex(options: readonly SelectOptionState[]): number {
  return options.findIndex((option) => !option.disabled);
}

export function lastEnabledIndex(options: readonly SelectOptionState[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function selectedOrFirstEnabledIndex(
  options: readonly SelectOptionState[],
  selectedIndex: number,
): number {
  return selectedIndex >= 0 && !options[selectedIndex]?.disabled
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
