/** The app's display languages. Bare language subtags, hermes parity: "zh" is
 *  Simplified Chinese ("languages are not countries" — no region codes as ids). */
export type Locale = "en" | "zh";

export const DEFAULT_LOCALE: Locale = "en";

/** Picker entries in curated order. `name` is the endonym (native name) shown in
 *  the picker so users recognize their language regardless of the current UI
 *  language. No country flags. (Hermes also carries an `englishName` per entry,
 *  but only to feed its search box — we have no search, so no field.) */
export const LOCALE_OPTIONS = [
  { id: "en", name: "English" },
  { id: "zh", name: "简体中文" },
] as const satisfies readonly { id: Locale; name: string }[];

/** Hermes's alias table, trimmed to our two locales. Keys are pre-normalized
 *  (lowercase); both hyphen and underscore variants are listed. */
const LOCALE_ALIASES: Record<string, Locale> = {
  en: "en",
  "en-us": "en",
  en_us: "en",
  zh: "zh",
  "zh-cn": "zh",
  zh_cn: "zh",
  "zh-hans": "zh",
  zh_hans: "zh",
  "zh-hans-cn": "zh",
  zh_hans_cn: "zh",
};

/** Coerce anything (persisted value, hand-edited settings.json) to a supported
 *  Locale. Unknown or non-string values read as the default (English). */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  return LOCALE_ALIASES[value.trim().toLowerCase()] ?? DEFAULT_LOCALE;
}
