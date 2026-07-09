/** The footer's keep-awake toggle: holds one `prevent-app-suspension` power-save blocker while on
 *  (system idle-sleep is blocked; the display may still sleep). Deliberately not persisted — every
 *  launch starts off, and the OS releases the blocker when the process exits.
 *  Spec: docs/superpowers/specs/2026-07-09-caffeinate-design.md */
export interface CaffeinateBlocker {
  start(type: "prevent-app-suspension"): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface CaffeinateDeps {
  /** The composition root passes Electron's powerSaveBlocker; tests pass a fake. */
  blocker: CaffeinateBlocker;
}

export interface Caffeinate {
  isOn(): boolean;
  /** Turn keep-awake on or off. Idempotent in both directions — a repeated set(true) never starts
   *  a second blocker. Returns the resulting state. */
  set(on: boolean): boolean;
}

export function createCaffeinate({ blocker }: CaffeinateDeps): Caffeinate {
  let blockerId: number | null = null;
  // Read through isStarted rather than trusting the cached id, so a blocker the OS dropped reads off.
  const isOn = (): boolean =>
    blockerId !== null && blocker.isStarted(blockerId);
  return {
    isOn,
    set(on) {
      if (on) {
        if (!isOn()) blockerId = blocker.start("prevent-app-suspension");
      } else if (blockerId !== null) {
        if (blocker.isStarted(blockerId)) blocker.stop(blockerId);
        blockerId = null;
      }
      return isOn();
    },
  };
}
