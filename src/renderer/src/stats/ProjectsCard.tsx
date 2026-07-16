import { Fragment, useState } from "react";
import { type StatsByProject } from "@shared/stats";
import { formatTokensShort } from "@shared/format";
import { useI18n } from "../i18n";
import { Swatch } from "../ui/atoms";
import { StatsCard, CardRegion } from "./shared";

/** How many project rows the By-project card reveals per step: it shows this many, then a
 *  "Show N more" button reveals another batch of this size on each click. */
const PROJECT_BATCH = 7;

/** One row of a Breakdown panel: an entity with its displayed-metric tokens and the color its bar (and
 *  optional swatch) take. The caller ranks the rows and assigns colors; the panel reveals rows in
 *  batches (see `Breakdown`), sizes bars against the largest displayed value, and renders the header and
 *  the "Show N more" control. */
type BreakdownRow = {
  key: string;
  label: string;
  title?: string;
  tokens: number;
  color: string;
};

/** The ranked-breakdown table behind By project: a titled table of entities, biggest first, each a row of
 *  name + Tokens with a full-width bar beneath. Shows `batch` rows, then a "Show N more" button reveals
 *  another batch on each click (N is the batch, or the remainder on the last step). Bars size against the
 *  largest DISPLAYED row, so revealing more rows can change the denominator; an all-zero window yields
 *  empty bars rather than a divide-by-zero. The bar is built inline (not the `Bar` atom) because its color
 *  is a dynamic CSS value, not a Tailwind class. */
function Breakdown({
  title,
  nameLabel,
  rows,
  showSwatch = false,
  batch,
}: {
  title: string;
  nameLabel: string;
  rows: BreakdownRow[];
  showSwatch?: boolean;
  batch: number;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(batch);
  const shown = rows.slice(0, visible);
  const max = Math.max(...shown.map((r) => r.tokens), 0);
  const rest = rows.length - shown.length;
  return (
    <StatsCard>
      <CardRegion title={title}>
        <table className="w-full table-fixed text-aux">
          <colgroup>
            <col className="w-[70%]" />
            <col className="w-[30%]" />
          </colgroup>
          <thead>
            <tr className="text-label uppercase tracking-wide text-fg-faint">
              <th
                scope="col"
                className="whitespace-nowrap pb-1.5 text-left font-normal"
              >
                {nameLabel}
              </th>
              <th
                scope="col"
                className="whitespace-nowrap pb-1.5 text-right font-normal"
              >
                {t.stats.shared.tokensHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <Fragment key={r.key}>
                <tr className={i === 0 ? "" : "border-t border-ink-850"}>
                  <td className="pt-2 pr-3 align-middle">
                    <span className="flex min-w-0 items-center gap-2">
                      {showSwatch && <Swatch color={r.color} />}
                      <span className="truncate text-fg" title={r.title}>
                        {r.label}
                      </span>
                    </span>
                  </td>
                  <td className="pt-2 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                    {formatTokensShort(r.tokens)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="pb-2 pt-1.5">
                    <div className="h-[5px] overflow-hidden rounded-full bg-ink-850">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${max > 0 ? (r.tokens / max) * 100 : 0}%`,
                          background: r.color,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + batch)}
            className="mt-2 text-meta text-fg-faint transition-colors hover:text-fg-muted"
          >
            {t.stats.shared.showMore(Math.min(batch, rest), rows.length)}
          </button>
        )}
      </CardRegion>
    </StatsCard>
  );
}

/** The per-project breakdown (#112) — a full-width card that reveals PROJECT_BATCH rows at a time. Keyed
 *  on the full cwd so two repos that share a basename stay separate (the cwd rides along as the row's
 *  hover title). Ranks by total tokens, the displayed Tokens metric. */
export function ProjectsCard({ rows }: { rows: StatsByProject[] }) {
  const { t } = useI18n();
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const ranked: BreakdownRow[] = rows
    .slice()
    .sort((a, b) => b.totalTokens - a.totalTokens || a.cwd.localeCompare(b.cwd))
    .map((r) => ({
      key: r.cwd,
      label: r.project,
      title: r.cwd,
      tokens: r.totalTokens,
      color: "var(--color-data-1)",
    }));
  return (
    <Breakdown
      title={t.stats.projects.title}
      nameLabel={t.stats.projects.nameLabel}
      rows={ranked}
      batch={PROJECT_BATCH}
    />
  );
}
