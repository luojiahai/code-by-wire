/** Relative time like "now" / "45s ago" / "10m ago" / "3h ago" / "2d ago". */
export function formatRelativeTime(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 8) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * A compact countdown to a reset, e.g. "2h 14m", "3d 4h", "30m", "<1m", or "now" once it has passed.
 * Pieces the largest two non-zero units so it stays short and never churns on seconds. Used for the
 * 5-hour / 7-day rate-limit windows. `now` is injected so it tracks the caller's render clock.
 */
export function formatResetCountdown(resetsAt: number, now: number): string {
  const ms = resetsAt - now;
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** How long ago a sample was taken: "just now" under a minute, then the two largest units in
 *  formatResetCountdown's style ("3m ago", "1h 4m ago"). A future or non-finite `thenMs` reads as
 *  "just now" — freshness display, never an error surface. */
export function formatAgoShort(thenMs: number, now: number): string {
  const ms = now - thenMs;
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  return `${m}m ago`;
}

/** A token count with thousands separators: 80710 → "80,710". The context and cost panels show exact
 *  figures (a rail row has room), so no k/M abbreviation. Negative or non-finite coerce to "0". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return Math.round(n).toLocaleString("en-US");
}

/** A duration as a short string counting up from zero: under 1s → "0.4s", under a minute → "12s", else
 *  the largest two units → "3m 20s" / "1h 4m". Mirrors formatResetCountdown's two-unit style. Non-finite
 *  or ≤0 → "0s". Used for a timeline turn's wall-clock. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return (ms / 1000).toFixed(1) + "s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (totalMin < 60) return s > 0 ? `${totalMin}m ${s}s` : `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** The k branch shows one decimal, so 999,950+ would round to "1000.0k" — promote those to the M
 *  branch instead ("1.00M"). */
const K_TO_M_PROMOTION = 999_950;

/** A token count abbreviated for the dense rail: 128400 → "128.4k", 2_480_000 → "2.48M". Under 1000 is
 *  the bare integer. Non-finite or ≤0 → "0". */
export function formatTokensShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= K_TO_M_PROMOTION) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

/** Like formatTokensShort but for a chart axis tick: trailing-zero decimals are trimmed, so a round tick
 *  reads "125M" not "125.00M" while a fractional one keeps the digits it needs ("12.5M", "2.48M"). The trim
 *  only touches a toFixed string (which always carries a decimal point), so it never eats a significant
 *  trailing zero like the one in "250". Non-finite or ≤0 → "0". */
export function formatTokensAxis(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const trim = (s: string): string => s.replace(/\.?0+$/, "");
  if (n >= K_TO_M_PROMOTION) return trim((n / 1_000_000).toFixed(2)) + "M";
  if (n >= 1000) return trim((n / 1000).toFixed(1)) + "k";
  return String(Math.round(n));
}

/** A token throughput like "86.4 t/s" / "1.3k t/s". Non-finite or ≤0 → "0 t/s". */
export function formatTps(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return "0 t/s";
  if (tps >= 1000) return (tps / 1000).toFixed(1) + "k t/s";
  return tps.toFixed(1) + " t/s";
}

/** An elapsed wall-clock counting up, the largest two units: "1h 42m" / "42s" / "0s". Delegates to
 *  formatDuration (same two-unit rule); a named alias so the session-clock call site reads as intent. */
export function formatClock(ms: number): string {
  return formatDuration(ms);
}

/** Three-letter month names, indexed 0–11. A fixed table (not toLocaleDateString) so the day-label
 *  formatters are deterministic across ICU builds and unit-testable. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** A 'YYYY-MM-DD' local day key as a short axis label: "Jun 14". Day-of-month is un-padded. */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** A 'YYYY-MM-DD' local day key as a full tooltip label: "Jun 14, 2026". */
export function formatDayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** A 'YYYY-MM-DD' local day key as its three-letter month, for the calendar's top axis: "Jun". */
export function formatMonthShort(day: string): string {
  const [, m] = day.split("-").map(Number);
  return MONTHS[m - 1];
}

/** A dollar figure from the statusLine's own accounting: "$4.21" / "$170.37"; at or above $1,000 the
 *  cents drop and thousands separate ("$1,205"). Non-finite or ≤0 coerce to "$0.00". Display-only —
 *  the value is Claude Code's total_cost_usd, never derived from a pricing table. */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0.00";
  if (n >= 1000) return "$" + Math.round(n).toLocaleString("en-US");
  return "$" + n.toFixed(2);
}

/** Bytes → a compact decimal size for the Settings readouts: "482 B", "7.4 kB", "7.5 MB", "1.2 GB".
 *  One decimal below 10 of a unit, whole numbers above — the same precision taper as formatTokens. */
export function formatBytes(n: number): string {
  if (n < 1000) return `${Math.max(0, Math.round(n))} B`;
  const units = ["kB", "MB", "GB", "TB"] as const;
  let v = n;
  let u = -1;
  do {
    v /= 1000;
    u++;
  } while (v >= 1000 && u < units.length - 1);
  return `${v < 10 ? v.toFixed(1) : String(Math.round(v))} ${units[u]}`;
}
