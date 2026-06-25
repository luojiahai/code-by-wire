import { useEffect, useState } from "react";
import {
  FAMILIES,
  resolvePricing,
  type Family,
  type ModelPricing,
  type PricingOverrides,
} from "@shared/models";
import { FAMILY_LABEL } from "../ui/meta";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";

/** The editable rate columns, each mapping to a ModelPricing field. */
const COLUMNS: { field: keyof ModelPricing; label: string }[] = [
  { field: "input", label: "Input" },
  { field: "cacheWrite5m", label: "Cache write 5m" },
  { field: "cacheWrite1h", label: "Cache write 1h" },
  { field: "cacheRead", label: "Cache read" },
  { field: "output", label: "Output" },
];

const PRICING_DOCS = "https://platform.claude.com/docs/en/about-claude/pricing";

/** The shared pricing table: one row per family, the five rate columns, each cell editable. An edited cell
 *  reads teal and exposes a reset ↺; "Reset all to defaults" clears every override. Fully controlled by
 *  `overrides`: calls `onChange` with the next full overrides object on every commit, and the caller
 *  persists. `highlightFamily` tints one model row (the session's model in the modal). */
export function PricingEditor({
  overrides,
  onChange,
  highlightFamily,
}: {
  overrides: PricingOverrides;
  onChange: (next: PricingOverrides) => void;
  highlightFamily?: Family;
}) {
  const setCell = (
    family: Family,
    field: keyof ModelPricing,
    value: number,
  ): void => {
    onChange({
      ...overrides,
      [family]: { ...overrides[family], [field]: value },
    });
  };
  const resetCell = (family: Family, field: keyof ModelPricing): void => {
    const fam = { ...overrides[family] };
    delete fam[field];
    const next = { ...overrides };
    if (Object.keys(fam).length === 0) delete next[family];
    else next[family] = fam;
    onChange(next);
  };
  const anyOverride = Object.keys(overrides).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
              <th scope="col" className="pb-2 text-left font-normal">
                Model
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.field}
                  scope="col"
                  className="px-2 pb-2 text-right font-normal"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAMILIES.map((family) => {
              const resolved = resolvePricing(family, overrides);
              return (
                <tr
                  key={family}
                  className={cx(
                    "border-t border-ink-850",
                    family === highlightFamily && "bg-ink-900/40",
                  )}
                >
                  <td className="py-1.5 pr-3 text-fg">
                    {FAMILY_LABEL[family]}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.field} className="px-2 py-1.5">
                      <PriceCell
                        value={resolved[c.field]}
                        edited={overrides[family]?.[c.field] !== undefined}
                        onCommit={(v) => setCell(family, c.field, v)}
                        onReset={() => resetCell(family, c.field)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-ink-850 pt-2.5">
        <p className="text-[11px] text-fg-faint">
          $ per 1M tokens · changes apply live, including past sessions
        </p>
        <button
          type="button"
          onClick={() => onChange({})}
          disabled={!anyOverride}
          className="shrink-0 rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          Reset all to defaults
        </button>
      </div>
      <a
        href={PRICING_DOCS}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] text-primary transition-colors hover:text-primary-bright"
      >
        <Icon name="arrow-up-right" size={11} />
        Anthropic pricing page
      </a>
    </div>
  );
}

/** One editable rate cell: a right-aligned number input committing on blur/Enter, teal when overridden,
 *  with a ↺ that clears just this field's override. Local text lets the user type freely; it re-syncs when
 *  the resolved value changes underneath (an external edit, a reset, or a reset-all). A blank/negative/NaN
 *  entry is rejected on commit, restoring the resolved value. */
function PriceCell({
  value,
  edited,
  onCommit,
  onReset,
}: {
  value: number;
  edited: boolean;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const commit = (): void => {
    const n = Number(text);
    if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <span className="flex items-center justify-end gap-1">
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cx(
          "w-16 rounded border bg-well px-1.5 py-0.5 text-right font-mono text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-primary/25",
          edited ? "border-primary/60 text-primary" : "border-ink-700 text-fg",
        )}
      />
      <button
        type="button"
        onClick={onReset}
        disabled={!edited}
        aria-label="Reset to default"
        title="Reset to default"
        className="text-fg-faint transition-colors hover:text-fg disabled:opacity-0"
      >
        <Icon name="rotate-ccw" size={11} />
      </button>
    </span>
  );
}
