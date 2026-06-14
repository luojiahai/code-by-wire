/**
 * Pure geometry for the contributions calendar (#115) — React-free so it unit-tests in the node env (the
 * repo has no DOM test harness), mirroring charts-geom.ts. Column-per-week layout (GitHub-style) and adaptive
 * intensity bucketing. Day keys are 'YYYY-MM-DD' local; colors flow through the renderer, never here.
 */
import { addDays } from "@shared/stats";

/** The local weekday of a 'YYYY-MM-DD' key: 0 = Sunday … 6 = Saturday. Built from the key's parts as a local
 *  Date, the same local-day basis the store's date(...,'localtime') bucketing uses. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** One cell of the calendar grid: its local day, and whether it falls inside the queried [startDay, endDay]
 *  window. Padding cells (outside the window, filling the first/last partial week) carry inRange=false so the
 *  renderer can blank them. */
export interface CalendarCell {
  day: string;
  inRange: boolean;
}

/**
 * Lay the window [startDay, endDay] out as week columns (GitHub-style): each column is a Sunday-to-Saturday
 * run of 7 cells (row 0 = Sunday), columns left-to-right oldest-to-newest. The grid pads back to the Sunday
 * on/before startDay and forward to the Saturday on/after endDay; padded cells are inRange=false. An empty
 * window (start after end) yields []. The week count is bounded defensively (a year is ~53 weeks).
 */
export function calendarGrid(
  startDay: string,
  endDay: string,
): CalendarCell[][] {
  if (startDay > endDay) return [];
  const gridStart = addDays(startDay, -weekdayOf(startDay)); // back to Sunday
  const gridEnd = addDays(endDay, 6 - weekdayOf(endDay)); // forward to Saturday
  const weeks: CalendarCell[][] = [];
  let day = gridStart;
  // The loop terminates on `day <= gridEnd`, always ≤ ~55 columns for any real window (a 365-day rolling
  // window or a full year, padded to whole weeks). The 60-week cap can't truncate that — it's only an
  // infinite-loop guard should a malformed key ever break the string comparison.
  for (let w = 0; w < 60 && day <= gridEnd; w++) {
    const col: CalendarCell[] = [];
    for (let r = 0; r < 7; r++) {
      col.push({ day, inRange: day >= startDay && day <= endDay });
      day = addDays(day, 1);
    }
    weeks.push(col);
  }
  return weeks;
}

/**
 * Ascending thresholds partitioning the window's POSITIVE values into `levels - 1` quantile bands, so the
 * intensity ramp adapts to the visible distribution rather than a fixed scale. Level 0 is reserved for
 * zero/no-activity days, so only positive values are partitioned. Duplicate thresholds a degenerate (flat)
 * distribution produces are collapsed — fewer effective bands, but the level stays in [0, levels-1]. A
 * `levels` of 1 (or fewer) yields [] — every value then maps to level 0 (no-activity only).
 */
export function intensityThresholds(values: number[], levels = 5): number[] {
  const bands = Math.max(1, levels - 1);
  if (bands <= 1) return [];
  const pos = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (pos.length === 0) return [];
  const out: number[] = [];
  for (let i = 1; i < bands; i++) {
    const idx = Math.min(pos.length - 1, Math.floor((i / bands) * pos.length));
    out.push(pos[idx]);
  }
  // Collapse consecutive equals (the sorted picks are non-decreasing), so a flat distribution can't push the
  // level past the peak band.
  return out.filter((v, i) => i === 0 || v !== out[i - 1]);
}

/** The 0-based intensity level for a value against `thresholds`: 0 for ≤ 0 (no activity), else 1 plus the
 *  number of thresholds it reaches — at most `thresholds.length + 1` (the peak band). `thresholds` must be
 *  ascending (as `intensityThresholds` produces them) for the level to read as monotonic. */
export function intensityLevel(value: number, thresholds: number[]): number {
  if (value <= 0) return 0;
  let level = 1;
  for (const t of thresholds) if (value >= t) level++;
  return level;
}

/** Where each month first appears across the grid's columns, for the calendar's top axis: the column index
 *  and the first in-range day of that month. A column is labeled when its earliest in-range cell is in a
 *  month not yet seen, so each month is labeled once, at its leftmost column. */
export function monthLabelCols(
  weeks: CalendarCell[][],
): { col: number; firstDay: string }[] {
  const out: { col: number; firstDay: string }[] = [];
  const seen = new Set<string>();
  weeks.forEach((col, ci) => {
    const cell = col.find((c) => c.inRange);
    if (!cell) return;
    const month = cell.day.slice(0, 7); // 'YYYY-MM'
    if (seen.has(month)) return;
    seen.add(month);
    out.push({ col: ci, firstDay: cell.day });
  });
  return out;
}
