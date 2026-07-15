import { useStore } from "@nanostores/react";
import { THEME_PREFERENCES, type ThemePreference } from "@shared/theme";
import { Card } from "../shell/page-primitives";
import { cx } from "../ui/atoms";
import { $themePreference, setThemePreference } from "../appearance/store";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * The Appearance card in Settings: a System / Light / Dark segmented control. Writes the shared
 * preference atom (appearance/store.ts), which persists + applies via main's nativeTheme.themeSource;
 * the light CSS branch keys off prefers-color-scheme, so the flip is immediate with no re-render.
 */
export function AppearanceCard() {
  const pref = useStore($themePreference);
  return (
    <Card title="Appearance">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">Theme</div>
          <div className="mt-0.5 text-meta text-fg-faint">
            Follow the system setting, or force light or dark
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md border border-ink-700 p-0.5">
          {THEME_PREFERENCES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={pref === p}
              onClick={() => setThemePreference(p)}
              className={cx(
                "rounded-[5px] px-2.5 py-1 text-meta transition-colors",
                pref === p
                  ? "bg-primary text-ink-900"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {LABELS[p]}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
