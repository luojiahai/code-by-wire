import { useStore } from "@nanostores/react";
import {
  $appTheme,
  $terminalTheme,
  setAppTheme,
  setTerminalTheme,
  type AppearanceMode,
} from "../ui/appearance-store";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";
import { Card } from "../shell/page-primitives";
import { useI18n } from "../i18n";
import { LanguagePicker } from "./LanguagePicker";

/**
 * The "Appearance" card in Settings: the Language picker (first row, hermes parity)
 * plus two independent Dark/Light controls — the app chrome and the terminal panels.
 * Reads/writes the shared nanostores directly (no props from App.tsx).
 */
export function AppearanceCard() {
  const { t } = useI18n();
  const appTheme = useStore($appTheme);
  const terminalTheme = useStore($terminalTheme);
  // In-render (not module-scope): the labels must re-resolve per locale switch.
  const modeOptions = [
    {
      value: "dark" as const,
      label: t.settings.appearance.dark,
      icon: "moon" as const,
    },
    {
      value: "light" as const,
      label: t.settings.appearance.light,
      icon: "sun" as const,
    },
  ];

  return (
    <Card title={t.settings.appearance.title}>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">
            {t.settings.appearance.language}
          </div>
          <div className="mt-0.5 text-meta text-fg-faint">
            {t.settings.appearance.languageDesc}
          </div>
        </div>
        <LanguagePicker />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-850 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">
            {t.settings.appearance.appTheme}
          </div>
          <div className="mt-0.5 text-meta text-fg-faint">
            {t.settings.appearance.appThemeDesc}
          </div>
        </div>
        <SegmentedSwitch<AppearanceMode>
          ariaLabel={t.settings.appearance.appTheme}
          value={appTheme}
          onChange={setAppTheme}
          options={modeOptions}
        />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-850 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">
            {t.settings.appearance.terminalTheme}
          </div>
          <div className="mt-0.5 text-meta text-fg-faint">
            {t.settings.appearance.terminalThemeDesc}
          </div>
        </div>
        <SegmentedSwitch<AppearanceMode>
          ariaLabel={t.settings.appearance.terminalTheme}
          value={terminalTheme}
          onChange={setTerminalTheme}
          options={modeOptions}
        />
      </div>
    </Card>
  );
}
