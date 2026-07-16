import type { Locale } from "@shared/locale";
import { en, type Translations } from "./en";
import { zh } from "./zh";

export const TRANSLATIONS: Record<Locale, Translations> = { en, zh };
