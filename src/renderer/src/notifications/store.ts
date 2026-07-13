import { atom } from "nanostores";

/**
 * The "Notify when a session needs input" preference, shared by its two consumers: the Settings
 * card (renders + toggles it) and the poll hook (gates the decision). Main's app-settings file is
 * the durable source of truth; this atom is the in-run mirror, seeded once at app mount
 * (initNotifyOnAwaiting) and written through on toggle — so the detector never has to re-ask main
 * on every 3s poll. Defaults on: the seed only ever confirms or turns it off.
 */
export const $notifyOnAwaiting = atom(true);

/** Seed the atom from the persisted setting. Called once from the poll hook's mount effect;
 *  a failed read keeps the default (on), matching main's `?? true` posture. */
export async function initNotifyOnAwaiting(): Promise<void> {
  try {
    $notifyOnAwaiting.set(await window.api.getNotifyOnAwaiting());
  } catch {
    // Keep the default; the setting is cosmetic enough that a failed read must not throw.
  }
}

/** Flip the preference: atom first (the card and the detector react immediately), then persist.
 *  Fire-and-forget on the write — a failed persist costs durability, not this run's behavior. */
export function setNotifyOnAwaiting(enabled: boolean): void {
  $notifyOnAwaiting.set(enabled);
  void window.api.setNotifyOnAwaiting(enabled);
}
