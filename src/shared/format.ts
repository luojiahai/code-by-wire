/** Equivalent API value as a short dollar string: $0.30 / $6.42 / $42.0 / $143. */
export function formatUsd(n: number): string {
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 10) return "$" + n.toFixed(1);
  return "$" + n.toFixed(2);
}

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

/** A token count abbreviated for the dense rail: 128400 → "128.4k", 2_480_000 → "2.48M". Under 1000 is
 *  the bare integer. Non-finite or ≤0 → "0". */
export function formatTokensShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
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

/**
 * The per-row cost figure plus whether it's an equivalent value (gets a leading ~ and "Equivalent API
 * value" framing) or real spend. Real spend (no ~) is shown only when we have Claude's own live figure
 * AND the account bills per API call; everything else is an estimate — the transcript-computed Equivalent
 * API value, a subscription's equivalent cost, or any figure before the account has resolved — so it gets
 * the ~. A computed fallback on an API account is therefore framed as equivalent, not as exact spend.
 */
export function costDisplay(opts: {
  liveCostUsd?: number;
  equivApiValueUsd: number;
  billingMode?: "subscription" | "api" | "unknown";
}): { text: string; equivalent: boolean } {
  const live = opts.liveCostUsd != null;
  const value = live ? opts.liveCostUsd! : opts.equivApiValueUsd;
  const equivalent = !(live && opts.billingMode === "api");
  return { text: (equivalent ? "~" : "") + formatUsd(value), equivalent };
}
