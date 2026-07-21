import { useState } from "react";
import { AGENTS, type AgentId } from "@shared/agents";
import type { ModelSelection } from "@shared/models";
import type { LaunchPreset } from "@shared/extra-args";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";

/**
 * The Command block of the New-session form (design direction B): the real spawn command rendered
 * as a locked, dimmed prefix (`claude --session-id <new> [--model m]` / bare `codex`) with the
 * user's extra args editable inline after it, plus a per-agent preset picker (pick fills the field;
 * ✕ deletes; re-saving a name overwrites) and an inline save-as-preset affordance. Validation is
 * the PARENT's: it derives `errorText` from @shared/extra-args and disables Create — this component
 * only renders the error, keeping one source of truth for what blocks a spawn.
 */
export function LaunchCommandField({
  agent,
  model,
  value,
  onChange,
  errorText,
  presets,
  onSavePreset,
  onDeletePreset,
}: {
  agent: AgentId;
  model: ModelSelection;
  value: string;
  onChange: (v: string) => void;
  /** Localized validation error, or null when the current value is valid. */
  errorText: string | null;
  presets: LaunchPreset[];
  onSavePreset: (name: string, args: string) => void;
  onDeletePreset: (name: string) => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  /** Non-null while the inline "name this preset" input is showing; holds the draft name. */
  const [draftName, setDraftName] = useState<string | null>(null);

  const prefix =
    agent === "claude"
      ? `claude --session-id <new>${model === "default" ? "" : ` --model ${model}`}`
      : AGENTS[agent].binary;

  function saveDraft(): void {
    const name = (draftName ?? "").trim();
    if (!name) return;
    onSavePreset(name, value);
    setDraftName(null);
  }

  return (
    <div>
      <label className="block text-meta font-semibold uppercase tracking-wider text-fg-muted">
        {t.shell.newSession.command}
      </label>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-925 px-2.5 py-0.5 text-aux text-fg-muted transition-colors hover:bg-ink-850"
          >
            {t.shell.newSession.presets}
            <Icon name="chevron-down" size={11} />
          </button>
          {menuOpen && (
            <>
              {/* click-away backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-ink-700 bg-ink-925 py-1 shadow-lg">
                {presets.map((p) => (
                  <div
                    key={p.name}
                    className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-aux hover:bg-ink-850"
                    onClick={() => {
                      onChange(p.args);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="truncate">
                      {p.name}{" "}
                      <span className="font-mono text-fg-faint">{p.args}</span>
                    </span>
                    <button
                      aria-label={t.shell.newSession.deletePreset(p.name)}
                      className="shrink-0 text-fg-faint hover:text-fg"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePreset(p.name);
                      }}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
                <div
                  className="cursor-pointer px-2.5 py-1.5 text-aux text-fg-faint hover:bg-ink-850"
                  onClick={() => {
                    onChange("");
                    setMenuOpen(false);
                  }}
                >
                  {t.shell.newSession.presetNone}
                </div>
              </div>
            </>
          )}
        </div>

        {value.trim() !== "" &&
          (draftName === null ? (
            <button
              onClick={() => setDraftName("")}
              className="text-aux text-fg-faint transition-colors hover:text-fg"
            >
              + {t.shell.newSession.savePreset}
            </button>
          ) : (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDraft();
                if (e.key === "Escape") setDraftName(null);
              }}
              onBlur={() => setDraftName(null)}
              placeholder={t.shell.newSession.presetNamePlaceholder}
              className="w-36 rounded-md border border-ink-700 bg-ink-925 px-2 py-0.5 text-aux outline-none"
            />
          ))}
      </div>

      <div
        className={`mt-1.5 flex items-baseline gap-1.5 rounded-md border border-dashed px-2.5 py-2 font-mono text-aux ${
          errorText ? "border-danger/60" : "border-ink-700"
        } bg-ink-925`}
      >
        <span className="shrink-0 whitespace-nowrap text-fg-faint">
          {prefix}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.shell.newSession.argsPlaceholder}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:italic placeholder:text-fg-faint"
        />
      </div>

      {errorText ? (
        <p className="mt-1 text-aux text-danger">{errorText}</p>
      ) : (
        <p className="mt-1 text-aux text-fg-faint">
          {t.shell.newSession.commandHint}
        </p>
      )}
    </div>
  );
}
