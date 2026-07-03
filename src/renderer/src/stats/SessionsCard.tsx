import { useState } from "react";
import { type StatsBySession, tokensOf } from "@shared/stats";
import {
  formatTokensShort,
  formatDuration,
  formatRelativeTime,
} from "@shared/format";
import { Icon } from "../ui/icons";
import { modelColorOf } from "../ui/meta";
import { Swatch } from "../ui/atoms";
import { CopyButton } from "../ui/CopyButton";
import {
  sortSessions,
  defaultDirFor,
  DEFAULT_SESSION_SORT,
  type SessionSort,
  type SessionSortKey,
} from "./session-sort";
import { StatsCard, CardRegion } from "./shared";

/** How many session rows the table reveals per step: it shows this many by the ACTIVE sort, then a
 *  "Show N more" button reveals another batch on each click — sort-then-slice, so re-sorting by tokens
 *  surfaces the heaviest sessions across all history, not a reshuffle of the most-recent N. */
const SESSION_BATCH = 11;

/** One sortable column header: a button that toggles the active sort. Clicking an inactive column sorts it
 *  by its natural first direction (defaultDirFor); clicking the active column flips direction. The active
 *  column shows a chevron, rotated up when ascending. `aria-sort` rides the th for assistive tech. */
function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  column: SessionSortKey;
  sort: SessionSort;
  onSort: (key: SessionSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`whitespace-nowrap pb-1.5 font-normal ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        // Buttons don't inherit text-transform from the uppercase <tr>, so set it here or the
        // sortable headers render mixed-case while the By-project <th>s above stay uppercase.
        className={`inline-flex items-center gap-0.5 uppercase transition-colors hover:text-fg ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-fg-muted" : ""}`}
      >
        {label}
        {active && (
          <Icon
            name="chevron-down"
            size={10}
            className={sort.dir === "asc" ? "rotate-180" : ""}
          />
        )}
      </button>
    </th>
  );
}

/** The per-Session table (#113): one row per Session with its project, last activity, duration, dominant
 *  model, turns, and tokens. Sortable on every column (client-side via sortSessions), defaulting to most
 *  recent activity first. The Tokens column follows the page's "Include cache" toggle, like the other
 *  breakdowns. Reveals SESSION_BATCH rows at a time by the active sort, via a "Show N more" button. */
export function SessionsCard({
  rows,
  includeCache,
}: {
  rows: StatsBySession[];
  includeCache: boolean;
}) {
  const [sort, setSort] = useState<SessionSort>(DEFAULT_SESSION_SORT);
  const [visible, setVisible] = useState(SESSION_BATCH);
  // Guard on the full set so the panel never vanishes on a pure-zero window (matches the other breakdowns).
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const onSort = (key: SessionSortKey): void =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDirFor(key) },
    );
  const sorted = sortSessions(rows, sort, includeCache);
  const top = sorted.slice(0, visible);
  const rest = sorted.length - top.length;
  const now = Date.now();
  return (
    <StatsCard>
      <CardRegion title="By session">
        <table className="w-full table-fixed text-aux">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[16%]" />
            <col className="w-[15%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="text-label uppercase tracking-wide text-fg-faint">
              <SortHeader
                label="Session"
                column="session"
                sort={sort}
                onSort={onSort}
                align="left"
              />
              <SortHeader
                label="Model"
                column="model"
                sort={sort}
                onSort={onSort}
                align="left"
              />
              <SortHeader
                label="Last activity"
                column="lastActivity"
                sort={sort}
                onSort={onSort}
              />
              <SortHeader
                label="Duration"
                column="duration"
                sort={sort}
                onSort={onSort}
              />
              <SortHeader
                label="Turns"
                column="turns"
                sort={sort}
                onSort={onSort}
              />
              <SortHeader
                label="Tokens"
                column="tokens"
                sort={sort}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {/* Key on the session id (globally unique). */}
            {top.map((r) => (
              <tr key={r.sessionId} className="border-t border-ink-850">
                <td className="py-1 pr-3">
                  <span className="block truncate text-fg" title={r.cwd}>
                    {r.title ?? r.project}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-meta text-fg-faint">
                    <span className="truncate">{r.project}</span>
                    <span className="font-mono">{r.sessionId.slice(0, 8)}</span>
                    <CopyButton value={r.sessionId} label="Copy session id" />
                  </span>
                </td>
                <td className="py-1 pr-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Swatch color={modelColorOf(r.modelRaw)} />
                    <span className="truncate font-mono text-fg-muted">
                      {r.modelRaw ?? "Unknown"}
                    </span>
                  </span>
                </td>
                <td className="py-1 pl-2 text-right tabular-nums text-fg-muted">
                  {/* lastActivityMs is 0 only when no turn had a known time; show a dash, not a
                      formatRelativeTime epoch render ("20000d ago") that fakes exact data. */}
                  {r.lastActivityMs === 0
                    ? "—"
                    : formatRelativeTime(r.lastActivityMs, now)}
                </td>
                <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                  {formatDuration(r.durationMs)}
                </td>
                <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                  {r.turns.toLocaleString("en-US")}
                </td>
                <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                  {formatTokensShort(tokensOf(r, includeCache))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + SESSION_BATCH)}
            className="mt-2 text-meta text-fg-faint transition-colors hover:text-fg-muted"
          >
            Show {Math.min(SESSION_BATCH, rest)} more ({sorted.length} total)
          </button>
        )}
      </CardRegion>
    </StatsCard>
  );
}
