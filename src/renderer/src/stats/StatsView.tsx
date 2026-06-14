import { useEffect, useState, type ReactNode } from "react";
import {
  type StatsSnapshot,
  type ScanProgress,
  type StatsTotals,
  type StatsByModel,
  type StatsByProject,
  type StatsByBranch,
  type StatsRange,
  DEFAULT_RANGE,
  emptySnapshot,
  branchRowKey,
} from "@shared/stats";
import { formatTokensShort, formatUsd } from "@shared/format";
import { Icon } from "../ui/icons";
import { Donut } from "../ui/charts";
import { MODEL_SEGMENT_COLORS } from "../ui/meta";
import { Swatch, Bar } from "../ui/atoms";

/** Poll cadences: brisk while the first cold backfill fills in, gentle once caught up so a turn landing
 *  in another Session still shows up without a manual refresh. */
const BACKFILL_POLL_MS = 40;
const WARM_POLL_MS = 1500;

/**
 * The Overall Stats view: the all-time Totals panel, plus a "building history" progress banner on a first
 * cold run. Polls stats:read while mounted — each poll runs one bounded scan step in the main process —
 * fast until the backfill is done, then at the warm cadence so turns from other Sessions appear on their
 * own. The effect's cleanup stops the poll on unmount, so selecting any Session ends all scan work; the
 * main process does nothing unprompted. (The range filter, calendar, time-series, and breakdowns are
 * later slices; this is still the prototype "Insights grid"'s top-left panel.)
 */
export function StatsView() {
  const [snap, setSnap] = useState<StatsSnapshot | null>(null);
  const [range, setRange] = useState<StatsRange>(DEFAULT_RANGE);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Range changed: blank the cards back to the loading state rather than leave the prior range's totals
    // showing under the newly-pressed button until this range's first poll lands.
    setSnap(null);
    const tick = (): void => {
      void window.api
        .readStats(range)
        .then((s) => {
          if (!alive) return;
          setSnap(s);
          timer = setTimeout(
            tick,
            s.progress.done ? WARM_POLL_MS : BACKFILL_POLL_MS,
          );
        })
        .catch(() => {
          // The handler is built never to reject; reaching here means the IPC bridge itself failed.
          // Keep the last good snapshot rather than blanking populated totals to zero (fall back to an
          // empty, done snapshot only on the very first poll), and retry at the warm cadence so a
          // transient bridge hiccup recovers on its own instead of freezing the view forever.
          if (!alive) return;
          setSnap((prev) => prev ?? emptySnapshot());
          timer = setTimeout(tick, WARM_POLL_MS);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [range]);

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto bg-ink-950 text-fg">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-lg text-fg">Overall stats</h1>
          <RangeFilter value={range} onChange={setRange} />
        </header>
        {/* null = first poll in flight: blank below the header (matches EmptyDetail's loading). */}
        {snap && (
          <>
            {!snap.progress.done && (
              <BuildingHistory progress={snap.progress} />
            )}
            {/* "No usage yet" only when the store is empty AND the scoped totals are too. The second
                clause is the safety: hasAnyTurns rides a separate query (safeHasAnyTurns → false on a read
                error), so a non-zero scoped count must still win, never EmptyStats over real cards. In the
                normal case totals.turns is 0 whenever hasAnyTurns is false, so this is a no-op. */}
            {!snap.hasAnyTurns &&
            snap.totals.turns === 0 &&
            snap.progress.done ? (
              <EmptyStats />
            ) : (
              <>
                <Totals totals={snap.totals} />
                {snap.byModel.length > 0 && <ByModel rows={snap.byModel} />}
                {snap.byProject.length > 0 && (
                  <ByProject rows={snap.byProject} />
                )}
                {snap.byBranch.length > 0 && <ByBranch rows={snap.byBranch} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The first-cold-run progress state (#107 user story 26): a thin determinate bar while the scan ingests
 *  history. Gone once progress.done — the warm polls that follow refresh the totals silently. */
function BuildingHistory({ progress }: { progress: ScanProgress }) {
  const pct = progress.filesTotal
    ? Math.round((progress.filesDone / progress.filesTotal) * 100)
    : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-ink-800 bg-ink-900/40 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>Building history…</span>
        <span className="tabular-nums">
          {progress.filesDone.toLocaleString("en-US")}/
          {progress.filesTotal.toLocaleString("en-US")}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** The page-global range filter (#110): five trailing windows, defaulting to 30d. It scopes every total
 *  on the page (not the calendar, which is range-independent — that's why it sits in the page header, not a
 *  panel). Presentational; the scoping happens main-side via the range passed through stats:read.
 *  `satisfies Record<StatsRange, string>` keeps this list exhaustive: a new range can't ship a main-side
 *  bound without also growing a button here, the way RANGE_DAYS enforces it for the bound. */
const RANGE_LABELS = {
  today: "Today",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
} satisfies Record<StatsRange, string>;

// Insertion order is the render order (none of the keys are array-index-like), and the cast restores the
// StatsRange key type that Object.entries widens to string.
const RANGE_OPTS = Object.entries(RANGE_LABELS) as [StatsRange, string][];

function RangeFilter({
  value,
  onChange,
}: {
  value: StatsRange;
  onChange: (r: StatsRange) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-900 p-0.5 text-[11px]">
      {RANGE_OPTS.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 transition-colors ${
            v === value
              ? "bg-ink-700 text-fg"
              : "text-fg-faint hover:text-fg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Totals({ totals }: { totals: StatsTotals }) {
  return (
    <StatsPanel title="Totals">
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          label="Sessions"
          value={totals.sessions.toLocaleString("en-US")}
        />
        <StatCard label="Turns" value={totals.turns.toLocaleString("en-US")} />
        <StatCard label="Input" value={formatTokensShort(totals.inputTokens)} />
        <StatCard
          label="Output"
          value={formatTokensShort(totals.outputTokens)}
        />
        <StatCard
          label="Cache read"
          value={formatTokensShort(totals.cacheReadTokens)}
        />
        <StatCard
          label="Equiv API value"
          value={formatUsd(totals.equivApiValueUsd)}
          title="Equivalent API value — a reference figure, not money owed"
        />
      </div>
    </StatsPanel>
  );
}

/** A press-to-flip pill for the By-model token metric (#111), shown in the panel header. Off (default)
 *  counts input + output only; on adds cache-read and cache-creation. Styled like RangeFilter's pressed
 *  state. */
function CacheToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title="Count cache-read and cache-creation tokens in the token figures (cost always includes them)"
      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
        on
          ? "border-ink-700 bg-ink-700 text-fg"
          : "border-ink-800 bg-ink-900 text-fg-faint hover:text-fg-muted"
      }`}
    >
      Include cache
    </button>
  );
}

/** The per-model breakdown (#111): a donut sized by each model's token share beside a table of tokens and
 *  Equivalent API value per raw model id. The "Include cache" toggle picks the token metric for both the
 *  donut and the Tokens column together, so the donut share always matches the visible numbers. It defaults
 *  to off (input + output) because cache-read volume dwarfs fresh tokens and would swamp the donut. Cost is
 *  unaffected; it always reflects every token at its rate. An unrecognized id shows n/a cost while its
 *  tokens still count; a turn with no recorded model rows as "Unknown". Color is paired onto each row so the
 *  donut and the table legend read off one source, no zip-by-index that could drift if rows reorder. */
function ByModel({ rows }: { rows: StatsByModel[] }) {
  const [includeCache, setIncludeCache] = useState(false);
  // Skip on a window with no tokens at all, judged on the full total so flipping the toggle never makes the
  // whole panel vanish; at worst the donut hides on a pure-cache window in exclude mode (below).
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const tokensOf = (r: StatsByModel) =>
    includeCache ? r.totalTokens : r.inputTokens + r.outputTokens;
  // Re-rank by the displayed metric so the table reads biggest-first and the donut colors pair to it; ties
  // break by raw id for stability. Color is assigned after the sort so it tracks the row, not the model.
  const ranked = rows
    .map((r) => ({ ...r, tokens: tokensOf(r) }))
    .sort(
      (a, b) =>
        b.tokens - a.tokens ||
        (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
    )
    .map((r, i) => ({
      ...r,
      color: MODEL_SEGMENT_COLORS[i % MODEL_SEGMENT_COLORS.length],
    }));
  // When the chosen metric is zero for every row (a pure cache-read window in exclude mode) the donut would
  // be a featureless track, so drop it and let the table stand alone.
  const segments = ranked.map((r) => ({ value: r.tokens, color: r.color }));
  const hasDonut = segments.some((s) => s.value > 0);
  return (
    <StatsPanel
      title="By model"
      right={<CacheToggle on={includeCache} onChange={setIncludeCache} />}
    >
      <div className="flex items-center gap-4">
        {hasDonut && <Donut segments={segments} />}
        <table className="min-w-0 flex-1 text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
              <th scope="col" className="pb-1.5 text-left font-normal">
                Model
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                Tokens
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                Equiv API value
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Key on the raw id (unique per GROUP BY row); the null "Unknown" bucket gets a NUL sentinel a
                real model id can never be, so it can't collide with a model whose raw string is "unknown". */}
            {ranked.map((r) => (
              <tr
                key={r.modelRaw ?? "\u0000"}
                className="border-t border-ink-850"
              >
                <td className="py-1 pr-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Swatch color={r.color} />
                    <span className="truncate text-fg">
                      {r.modelRaw ?? "Unknown"}
                    </span>
                  </span>
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-fg-muted">
                  {formatTokensShort(r.tokens)}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-fg-muted">
                  {r.equivApiValueUsd == null
                    ? "n/a"
                    : formatUsd(r.equivApiValueUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StatsPanel>
  );
}

/** The per-project breakdown (#112): the top projects as horizontal bars with their tokens and Equivalent
 *  API value. Rows key and rank on the full cwd, so two repos that share a basename are separate rows — both
 *  labelled by basename, told apart by the cwd surfaced on hover (the row's title). Bars size on each
 *  project's share of the top project's tokens. Cost is the project's summed Equivalent API value, n/a when
 *  none of its turns ran a recognized model. Capped to the top N with a "+N more" note, so a long project
 *  list stays bounded without silently hiding the tail. */
const TOP_PROJECTS = 8;
function ByProject({ rows }: { rows: StatsByProject[] }) {
  // Guard on the full set so the panel never vanishes on a pure-zero window; rows are sorted desc, so the
  // first is the largest and (past this guard) > 0 — a safe bar denominator.
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const top = rows.slice(0, TOP_PROJECTS);
  const max = top[0].totalTokens;
  const rest = rows.length - top.length;
  return (
    <StatsPanel title="By project">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
            <th scope="col" className="pb-1.5 text-left font-normal">
              Project
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Tokens
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Equiv API value
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Key on the full cwd (the unique grouping key), so two same-basename projects never collide. */}
          {top.map((r) => (
            <tr key={r.cwd} className="border-t border-ink-850">
              <td className="py-1.5 pr-3 align-middle">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-fg" title={r.cwd}>
                    {r.project}
                  </span>
                  <Bar
                    pct={(r.totalTokens / max) * 100}
                    fill="bg-primary/70"
                    className="w-full"
                  />
                </div>
              </td>
              <td className="py-1.5 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                {formatTokensShort(r.totalTokens)}
              </td>
              <td className="py-1.5 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                {r.equivApiValueUsd == null
                  ? "n/a"
                  : formatUsd(r.equivApiValueUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-[11px] text-fg-faint">
          +{rest} more {rest === 1 ? "project" : "projects"}
        </p>
      )}
    </StatsPanel>
  );
}

/** The per-branch breakdown (#112): a table of (project, git branch) pairs with tokens and Equivalent API
 *  value. Keyed on the full cwd plus the branch, so the same branch name in two projects stays distinct and
 *  same-basename projects don't merge; a turn that recorded no branch shows a dash. Capped to the top N with
 *  a "+N more" note. */
const TOP_BRANCHES = 12;
function ByBranch({ rows }: { rows: StatsByBranch[] }) {
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const top = rows.slice(0, TOP_BRANCHES);
  const rest = rows.length - top.length;
  return (
    <StatsPanel title="By branch">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
            <th scope="col" className="pb-1.5 text-left font-normal">
              Project
            </th>
            <th scope="col" className="pb-1.5 text-left font-normal">
              Branch
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Tokens
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Equiv API value
            </th>
          </tr>
        </thead>
        <tbody>
          {/* The same NUL-joined (cwd, branch) key the store folds on, stable and collision-free. */}
          {top.map((r) => (
            <tr
              key={branchRowKey(r.cwd, r.branch)}
              className="border-t border-ink-850"
            >
              <td className="py-1 pr-3">
                <span className="block truncate text-fg" title={r.cwd}>
                  {r.project}
                </span>
              </td>
              <td className="py-1 pr-3">
                <span className="block truncate font-mono text-fg-muted">
                  {r.branch ?? "—"}
                </span>
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {formatTokensShort(r.totalTokens)}
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {r.equivApiValueUsd == null
                  ? "n/a"
                  : formatUsd(r.equivApiValueUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-[11px] text-fg-faint">
          +{rest} more {rest === 1 ? "branch" : "branches"}
        </p>
      )}
    </StatsPanel>
  );
}

function EmptyStats() {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-24 text-fg-faint">
      <Icon name="chart-column" size={28} />
      <p className="text-[13px]">No usage yet.</p>
    </div>
  );
}

/** A bordered, titled section box for the stats page — the shell later slices hang the calendar,
 *  time-series, and breakdown panels off. `right` is an optional header slot (a per-panel toggle). */
function StatsPanel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-925 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

/** One stat: an uppercase eyebrow label over a display-type figure. */
function StatCard({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex flex-col justify-center rounded-md border border-ink-800 bg-ink-900/40 px-3 py-2">
      <div className="truncate text-[10px] uppercase tracking-wide text-fg-faint">
        {label}
      </div>
      <div
        className="mt-0.5 truncate font-display text-base text-fg"
        title={title}
      >
        {value}
      </div>
    </div>
  );
}
