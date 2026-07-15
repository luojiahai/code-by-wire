import { atom } from "nanostores";
import type { ThemePreference } from "@shared/theme";

/**
 * The theme preference (System / Light / Dark). Main's app-settings file is the durable source of
 * truth and drives nativeTheme.themeSource; this atom is the in-run mirror the Appearance card
 * renders. Seeded once at mount (initThemePreference), written through on change. Defaults "system".
 */
export const $themePreference = atom<ThemePreference>("system");

/** Seed the atom from the persisted preference. A failed read keeps the default ("system"). */
export async function initThemePreference(): Promise<void> {
  try {
    $themePreference.set(await window.api.getThemePreference());
  } catch {
    // Cosmetic; a failed read must not throw.
  }
}

/** Set the preference: atom first (the card reacts immediately), then persist + apply via main. */
export function setThemePreference(pref: ThemePreference): void {
  $themePreference.set(pref);
  void window.api.setThemePreference(pref).catch(() => {});
}
