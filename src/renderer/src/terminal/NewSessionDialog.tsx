import { useState, useEffect, useRef } from "react";
import { FAMILIES, type Family, type ModelDefaults } from "@shared/models";
import { FAMILY_LABEL } from "../ui/meta";
import { Icon } from "../ui/icons";
import { ModalShell } from "../ui/ModalShell";

/** The create-a-Managed-session form: choose a directory (native picker) and a model, then spawn. */
export function NewSessionDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (cwd: string, model: Family) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [model, setModel] = useState<Family>("sonnet");
  const [defaults, setDefaults] = useState<ModelDefaults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userPickedModel = useRef(false);

  // Fetch the configured model defaults once on mount: per-family overrides for the picker labels,
  // and the default family to pre-select.
  useEffect(() => {
    void window.api
      .modelDefaults()
      .then((d) => {
        setDefaults(d);
        if (!userPickedModel.current) {
          // Pre-select the configured default, else keep "sonnet", then clamp to the allowlist so the
          // picker can never preselect (and Create can never spawn) a model availableModels excludes.
          let next: Family = d.default ?? "sonnet";
          if (d.allowed && !d.allowed.includes(next))
            next = d.allowed[0] ?? next;
          setModel(next);
        }
      })
      .catch(() => {
        /* keep defaults null; picker falls back to FAMILIES + bare labels */
      });
  }, []);

  async function pick() {
    const dir = await window.api.terminal.pickDirectory();
    if (dir) setCwd(dir);
  }

  async function create() {
    if (!cwd || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(cwd, model);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed to start the session");
    }
  }

  return (
    <ModalShell
      labelledBy="new-session-title"
      widthClass="w-[28rem]"
      closeDisabled={busy}
      onClose={onCancel}
    >
      <div id="new-session-title" className="text-subhead font-semibold">
        New Managed session
      </div>
      <p className="mt-1.5 text-aux leading-relaxed text-fg-faint">
        Spawns <span className="font-mono">claude</span> in the chosen directory
        and drives it from a live terminal.
      </p>

      <label className="mt-4 block text-meta font-semibold uppercase tracking-wider text-fg-muted">
        Directory
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={() => void pick()}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-925 px-2.5 py-1 text-aux transition-colors hover:bg-ink-850"
        >
          <Icon name="folder-open" size={13} /> Choose…
        </button>
        <span className="truncate font-mono text-aux text-fg-faint">
          {cwd ?? "No directory chosen"}
        </span>
      </div>

      <label className="mt-4 block text-meta font-semibold uppercase tracking-wider text-fg-muted">
        Model
      </label>
      <div className="relative mt-1.5">
        <select
          value={model}
          onChange={(e) => {
            userPickedModel.current = true;
            setModel(e.target.value as Family);
          }}
          className="w-full appearance-none rounded-md border border-ink-700 bg-well py-2 pl-2.5 pr-8 text-body text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        >
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

      {error && <p className="mt-3 text-aux text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-body text-fg-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
        <button
          onClick={() => void create()}
          disabled={!cwd || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body font-medium text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
        >
          <Icon name="plus" size={13} />
          {busy ? "Starting…" : "Create"}
        </button>
      </div>
    </ModalShell>
  );
}
