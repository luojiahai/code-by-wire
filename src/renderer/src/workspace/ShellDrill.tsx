import { ShellLog } from "./panels/ShellLog";
import type { ShellOutputState } from "./use-shell-output";

/** The drilled-in background-shell surface: a breadcrumb (Session › <command>, read-only) above the full
 *  output log. A pure renderer of the `output` it's handed — the poll is lifted to WorkspaceBody so it
 *  survives the Managed tab toggle. Always read-only; cbw never controls a shell. */
export function ShellDrill({
  label,
  onBack,
  output,
}: {
  label: string;
  onBack: () => void;
  output: ShellOutputState;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 text-[11px]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Session
        </button>
        <span className="text-ink-700">›</span>
        <span
          className="min-w-0 truncate font-mono font-semibold text-fg"
          title={label}
        >
          {label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[9px] uppercase tracking-wider text-accent-bright">
          ● Read-only shell
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ShellLog output={output} />
      </div>
    </div>
  );
}
