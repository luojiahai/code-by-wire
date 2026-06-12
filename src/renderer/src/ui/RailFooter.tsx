/** A thin strip pinned at the bottom of the rail carrying the Claude Code CLI version from the
 *  freshest capture. Renders nothing when no version was reported. */
export function RailFooter({ version }: { version?: string }) {
  if (!version) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-ink-800 px-3 py-1.5 font-mono text-[10px] text-fg-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-working" />
      Claude Code · v{version}
    </div>
  );
}
