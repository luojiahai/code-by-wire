import { useState, useEffect } from "react";
import {
  FAMILIES,
  type ModelSelection,
  type ModelDefaults,
} from "@shared/models";
import { AGENT_IDS, AGENTS, type AgentId } from "@shared/agents";
import { FAMILY_LABEL } from "../ui/meta";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import { PageHeader, Card } from "./page-primitives";

/**
 * The inline create-a-Managed-session form (design spec §5): the app's sole create-a-session surface,
 * rendered directly in the middle column's content area rather than behind a modal overlay — no
 * backdrop, no focus trap, so it owns its own window-level Escape listener and self-centers via a
 * full-size flex wrapper. `App.tsx` mounts it at the `NEW_SESSION_ID` route — reached from the
 * sidebar's "New session" button and, seeded via `initialCwd`/`initialError`, from a sidebar folder
 * quick-add that failed and fell back here to retry.
 */
export function NewSessionView({
  onCreate,
  onCancel,
  canSpawnFor,
  busy: externalBusy,
  initialCwd,
  initialError,
}: {
  onCreate: (
    cwd: string,
    model: ModelSelection,
    agent: AgentId,
  ) => void | Promise<void>;
  onCancel: () => void;
  /** Per-agent spawn gate: an agent whose CLI check failed renders as a disabled option. */
  canSpawnFor: (agent: AgentId) => boolean;
  /** An external in-flight signal from the caller (e.g. a future `App.tsx`'s broader busy state),
   *  OR'd with this view's own internal busy state — lets a caller widen the disabled/"Starting…"
   *  window without this component needing to know why. */
  busy?: boolean;
  /** Seeds the directory — set when a sidebar quick-add fails and routes here keeping its cwd.
   *  Read once on mount; the caller re-keys the view to re-seed. */
  initialCwd?: string;
  /** Seeds the error line with the failure that routed here. Read once on mount. */
  initialError?: string;
}) {
  const { t } = useI18n();
  const [cwd, setCwd] = useState<string | null>(initialCwd ?? null);
  const [agent, setAgent] = useState<AgentId>("claude");
  const [model, setModel] = useState<ModelSelection>("default");
  const [defaults, setDefaults] = useState<ModelDefaults | null>(null);
  const [internalBusy, setInternalBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const busy = internalBusy || (externalBusy ?? false);

  // Fetch the configured model defaults once on mount, only for the picker's family labels and the
  // allowlist. The resting selection is always "Default" now, so we no longer preselect a family.
  useEffect(() => {
    void window.api
      .modelDefaults()
      .then((d) => setDefaults(d))
      .catch(() => {
        /* keep defaults null; picker falls back to FAMILIES + bare labels */
      });
  }, []);

  // ModalShell used to own Escape-to-close; without it, this view owns its own window-level listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function pick() {
    const dir = await window.api.terminal.pickDirectory();
    if (dir) setCwd(dir);
  }

  async function create() {
    if (!cwd || busy) return;
    setInternalBusy(true);
    setError(null);
    try {
      await onCreate(cwd, model, agent);
    } catch (e) {
      setInternalBusy(false);
      setError(
        e instanceof Error ? e.message : t.shell.newSession.failedToStart,
      );
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-950 text-fg">
      <div className="w-full max-w-[420px]">
        <PageHeader
          title={t.shell.sidebar.newSession}
          lede={
            <>
              {t.shell.newSession.ledeBefore}{" "}
              <span className="font-mono">{AGENTS[agent].binary}</span>{" "}
              {t.shell.newSession.ledeGeneric}
            </>
          }
        />
        <div className="mt-4">
          <Card title={t.shell.newSession.sessionSetup}>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <label className="block text-meta font-semibold uppercase tracking-wider text-fg-muted">
                  {t.shell.newSession.agent}
                </label>
                <div className="relative mt-1.5">
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value as AgentId)}
                    className="w-full appearance-none rounded-md border border-ink-700 bg-well py-2 pl-2.5 pr-8 text-body text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  >
                    {AGENT_IDS.map((id) => (
                      <option key={id} value={id} disabled={!canSpawnFor(id)}>
                        {AGENTS[id].label}
                        {canSpawnFor(id)
                          ? ""
                          : ` — ${t.settings.cli.unavailableShort}`}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron-down"
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
                  />
                </div>
              </div>

              <div>
                <label className="block text-meta font-semibold uppercase tracking-wider text-fg-muted">
                  {t.shell.newSession.directory}
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => void pick()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-925 px-2.5 py-1 text-aux transition-colors hover:bg-ink-850"
                  >
                    <Icon name="folder-open" size={13} />{" "}
                    {t.shell.newSession.choose}
                  </button>
                  <span className="truncate font-mono text-aux text-fg-faint">
                    {cwd ?? t.shell.newSession.noDirectoryChosen}
                  </span>
                </div>
              </div>

              {AGENTS[agent].capabilities.hasModelPicker && (
                <div>
                  <label className="block text-meta font-semibold uppercase tracking-wider text-fg-muted">
                    {t.shell.newSession.model}
                  </label>
                  <div className="relative mt-1.5">
                    <select
                      value={model}
                      onChange={(e) =>
                        setModel(e.target.value as ModelSelection)
                      }
                      className="w-full appearance-none rounded-md border border-ink-700 bg-well py-2 pl-2.5 pr-8 text-body text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                    >
                      <option value="default">
                        {t.shell.newSession.modelDefault}
                      </option>
                      {(defaults?.allowed ?? FAMILIES).map((id) => {
                        const override = defaults?.overrides[id];
                        return (
                          <option key={id} value={id}>
                            {FAMILY_LABEL[id]}
                            {override ? ` (${override})` : ""}
                          </option>
                        );
                      })}
                    </select>
                    <Icon
                      name="chevron-down"
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-aux text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={onCancel}
                  className="rounded-md px-3 py-1.5 text-body text-fg-muted transition-colors hover:text-fg"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={() => void create()}
                  disabled={!cwd || busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body font-medium text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
                >
                  <Icon name="plus" size={13} />
                  {busy
                    ? t.shell.newSession.starting
                    : t.shell.newSession.create}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
