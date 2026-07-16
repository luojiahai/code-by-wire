import { useStore } from "@nanostores/react";
import type { Locale } from "@shared/locale";
import { TRANSLATIONS } from "./catalog";
import type { Translations } from "./en";
import { $locale, setLocale } from "./locale-store";

/** Hermes-parity hook surface: `const { t } = useI18n()` then `t.settings.appearance.title`.
 *  Subscribes via useStore, so a locale switch re-renders every consumer. */
export function useI18n(): {
  t: Translations;
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useStore($locale);
  return { t: TRANSLATIONS[locale], locale, setLocale };
}
