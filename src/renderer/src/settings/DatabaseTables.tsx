import { useState } from "react";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";

export interface DatabaseTableInfo {
  name: string;
  rows: number | null;
  purpose: string;
  columns: readonly string[];
}

export function DatabaseTables({
  label,
  tables,
}: {
  label: string;
  tables: DatabaseTableInfo[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink-850">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-mono text-meta tracking-[0.12em] text-fg-faint transition-colors hover:text-fg-muted"
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={13} />
        <span>
          {label.toUpperCase()} ({tables.length})
        </span>
      </button>
      {open && (
        <div className="border-t border-ink-850 bg-ink-950/35">
          {tables.map((table) => (
            <div
              key={table.name}
              className="border-b border-ink-850 px-4 py-3 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <code className="text-aux text-fg-muted">{table.name}</code>
                <span className="font-mono text-meta tabular-nums text-fg-faint">
                  {table.rows === null
                    ? "—"
                    : table.rows.toLocaleString("en-US")}
                </span>
              </div>
              <p className="mt-1 text-meta text-fg-faint">{table.purpose}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {table.columns.map((column) => (
                  <code
                    key={column}
                    className={cx(
                      "rounded border border-ink-800 bg-ink-900 px-1.5 py-0.5",
                      "text-[10px] leading-4 text-fg-faint",
                    )}
                  >
                    {column}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
