import { AGENT_IDS, AGENTS } from "@shared/agents";
import { useI18n } from "../i18n";
import { AgentIcon } from "../ui/agent-icons";
import type { SessionsListPreferences } from "./session-list-preferences";

export function SessionFilterMenu({
  preferences,
  onChange,
  onClose,
}: {
  preferences: SessionsListPreferences;
  onChange: (preferences: SessionsListPreferences) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-(--ui-control-hover-background) hover:text-fg";

  return (
    <div
      role="menu"
      aria-label={t.shell.sidebar.filterMenuLabel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="w-48 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="px-2 pb-1 pt-0.5 text-[0.6875rem] font-medium text-(--ui-text-quaternary)">
          {t.shell.sidebar.visibilityGroup}
        </legend>
        <label className={itemClass}>
          <input
            type="radio"
            name="session-visibility"
            value="all"
            checked={preferences.visibility === "all"}
            onChange={() => onChange({ ...preferences, visibility: "all" })}
          />
          {t.shell.sidebar.showAll}
        </label>
        <label className={itemClass}>
          <input
            type="radio"
            name="session-visibility"
            value="active"
            checked={preferences.visibility === "active"}
            onChange={() => onChange({ ...preferences, visibility: "active" })}
          />
          {t.shell.sidebar.activeOnly}
        </label>
      </fieldset>

      <div className="my-1 border-t border-(--ui-stroke-tertiary)" />
      <label className={itemClass}>
        <input
          type="checkbox"
          checked={preferences.showAgentIcons}
          onChange={(event) =>
            onChange({
              ...preferences,
              showAgentIcons: event.currentTarget.checked,
            })
          }
        />
        {t.shell.sidebar.showAgentIcons}
      </label>

      <div className="my-1 border-t border-(--ui-stroke-tertiary)" />
      <fieldset className="m-0 border-0 p-0">
        <legend className="px-2 pb-1 pt-0.5 text-[0.6875rem] font-medium text-(--ui-text-quaternary)">
          {t.shell.sidebar.agentGroup}
        </legend>
        <label className={itemClass}>
          <input
            type="radio"
            name="session-agent"
            value="all"
            checked={preferences.agent === "all"}
            onChange={() => onChange({ ...preferences, agent: "all" })}
          />
          {t.shell.sidebar.allAgents}
        </label>
        {AGENT_IDS.map((agent) => (
          <label key={agent} className={itemClass}>
            <input
              type="radio"
              name="session-agent"
              value={agent}
              checked={preferences.agent === agent}
              onChange={() => onChange({ ...preferences, agent })}
            />
            <AgentIcon agent={agent} size={13} />
            {AGENTS[agent].label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
