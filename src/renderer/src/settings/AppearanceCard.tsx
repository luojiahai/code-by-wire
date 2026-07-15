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

const MODE_OPTIONS = [
  { value: "dark" as const, label: "Dark", icon: "moon" as const },
  { value: "light" as const, label: "Light", icon: "sun" as const },
];

/**
 * The "Appearance" card in Settings: two independent Dark/Light controls — the app chrome (panels,
 * sidebar, settings, markdown code blocks) and the terminal panels (interactive shell rail + the
 * observed Claude-session terminal). Both default to Dark. Reads/writes the shared nanostores
 * directly (no props from App.tsx) — see the 2026-07-14 light-theme design doc.
 */
export function AppearanceCard() {
  const appTheme = useStore($appTheme);
  const terminalTheme = useStore($terminalTheme);

  return (
    <Card title="Appearance">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">App theme</div>
          <div className="mt-0.5 text-meta text-fg-faint">
            The panels, sidebar, and settings
          </div>
        </div>
        <SegmentedSwitch<AppearanceMode>
          ariaLabel="App theme"
          value={appTheme}
          onChange={setAppTheme}
          options={MODE_OPTIONS}
        />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-850 px-4 py-3">
        <div className="min-w-0">
          <div className="text-body text-fg">Terminal theme</div>
          <div className="mt-0.5 text-meta text-fg-faint">
            The interactive shell and the observed session terminal
          </div>
        </div>
        <SegmentedSwitch<AppearanceMode>
          ariaLabel="Terminal theme"
          value={terminalTheme}
          onChange={setTerminalTheme}
          options={MODE_OPTIONS}
        />
      </div>
    </Card>
  );
}
