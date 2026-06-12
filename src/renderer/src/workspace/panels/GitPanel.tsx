import type { GitInfo } from "@shared/metrics";
import { PanelSection, PanelHeading } from "./chrome";
import { MetricRow } from "./MetricRow";

/** The local git glance. Hidden entirely when the session's cwd isn't a repo. */
export function GitPanel({ git }: { git: GitInfo | null | undefined }) {
  if (!git) return null;
  const changes =
    git.insertions || git.deletions ? (
      <span>
        <span className="text-ok">+{git.insertions}</span>{" "}
        <span className="text-danger">−{git.deletions}</span>
      </span>
    ) : null;
  const ahead =
    git.ahead != null && git.behind != null
      ? `↑${git.ahead} ↓${git.behind}`
      : null;
  return (
    <PanelSection>
      <PanelHeading>Git</PanelHeading>
      {/* Rows in their own tight group (space-y-1, matching the Cost/Context legends) so they don't
          inherit PanelSection's looser space-y-2 and stand out from the rest of the rail. */}
      <div className="space-y-1">
        <MetricRow label="Branch" value={git.branch} tone="text-fg" />
        <MetricRow label="Changes" value={changes} />
        <MetricRow label="Ahead / behind" value={ahead} />
        <MetricRow label="SHA" value={git.sha} tone="text-fg-muted" />
        <MetricRow
          label="Status"
          value={git.dirty ? "✗ dirty" : "✓ clean"}
          tone={git.dirty ? "text-danger" : "text-ok"}
        />
      </div>
    </PanelSection>
  );
}
