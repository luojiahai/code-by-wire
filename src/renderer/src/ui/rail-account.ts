import type { Account, RateLimit } from "@shared/types";
import { formatResetCountdown } from "@shared/format";
import { clampPct } from "./charts-geom";

/** One rate-limit row in the subscription block: a label, a clamped percent, and a reset countdown. */
export interface RailGauge {
  label: string;
  pct: number;
  /** Compact reset countdown for the gauge line, e.g. "2h 14m" or "5d". */
  reset: string;
}

/** The resolved view for the rail's account block — one of two mutually exclusive modes. Subscription
 *  carries the login email and rate-limit gauges; api carries just the endpoint host. */
export type RailAccountView =
  | {
      mode: "subscription";
      email: string | null;
      plan: string;
      gauges: RailGauge[];
    }
  | { mode: "api"; label: string; plan: string };

function planLabel(billingMode: Account["billingMode"]): string {
  if (billingMode === "subscription") return "Claude · subscription";
  if (billingMode === "api") return "Claude · API";
  return "Claude";
}

/** Cloud-provider keys to display names. Only the well-known three are curated; other keys (mantle,
 *  anthropic_aws) fall back to a title-cased label. */
const FRIENDLY_PROVIDER: Record<string, string> = {
  bedrock: "AWS Bedrock",
  vertex: "Google Vertex",
  foundry: "Microsoft Foundry",
};

/** A display name for a cloud-provider key: the curated name, else the key title-cased
 *  (mantle -> "Mantle", anthropic_aws -> "Anthropic Aws"). */
function friendlyProvider(provider: string): string {
  return (
    FRIENDLY_PROVIDER[provider] ??
    provider
      .split(/[_-]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/** The api plan line. Name the upstream provider only when there's also a host to contrast it with (a
 *  Portkey-style gateway). A cloud provider (provider, no host) or a direct account (host, no provider)
 *  both read plainly as "Claude · API". */
function apiPlanLabel(
  host: string | null,
  provider: string | undefined,
): string {
  return host && provider ? `Claude · API · via ${provider}` : "Claude · API";
}

function gauge(label: string, limit: RateLimit, now: number): RailGauge {
  return {
    label,
    pct: clampPct(Math.round(limit.usedPct)),
    reset: formatResetCountdown(limit.resetsAt, now),
  };
}

/** The base URL as a bare host for display: a leading http(s):// scheme and a single trailing slash
 *  stripped, host/port/path preserved. A value with no recognizable scheme is shown verbatim. */
function bareHost(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Mask an email for display: the first couple of local-part characters, a fixed run of bullets, and the
 * full domain (e.g. "ljiahai@hotmail.com" -> "lj••••@hotmail.com"). The bullet count is fixed, not the real
 * local-part length, so the masked form doesn't leak how long the address is. The domain stays in full: it's
 * the mail provider, the strongest "which account am I" hint, and low sensitivity. A short local part reveals
 * at most length-1 chars so it's never shown whole. A value with no '@' (not a real email, defensive only) is
 * masked the same way with no domain.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? "" : email.slice(at); // includes the leading "@"
  const prefixLen = Math.min(2, Math.max(0, local.length - 1));
  return local.slice(0, prefixLen) + "••••" + domain;
}

/**
 * Resolve what the rail's account block should show. Two mutually exclusive modes:
 *
 * - subscription: the 5h and weekly windows (each with a reset countdown) and the login email. Returns null when there's neither an email nor a window
 *   (ADR-0001 graceful degradation).
 * - api: the endpoint as a bare host, or a friendly cloud-provider name when there's no host. Requires a
 *   base URL or a provider; an api account with neither has nothing to surface. A gateway that names its
 *   upstream provider gets a "via {provider}" plan line.
 *
 * Anything else (an 'unknown' account, or 'api' with neither a base URL nor a provider) returns null, so the
 * block disappears rather than show a window-less subscription or mislabel gateway billing with a stale email.
 */
export function railAccountModel(
  account: Account | null,
  now: number,
): RailAccountView | null {
  if (!account) return null;

  if (account.billingMode === "subscription") {
    const gauges: RailGauge[] = [];
    if (account.fiveHour) gauges.push(gauge("5h", account.fiveHour, now));
    if (account.sevenDay) gauges.push(gauge("Weekly", account.sevenDay, now));
    const email = account.email ?? null;
    if (!email && gauges.length === 0) return null; // subscription with nothing live to show (windows all expired)
    return {
      mode: "subscription",
      email,
      plan: planLabel(account.billingMode),
      gauges,
    };
  }

  if (
    account.billingMode === "api" &&
    (account.apiBaseUrl || account.apiProvider)
  ) {
    const host = account.apiBaseUrl ? bareHost(account.apiBaseUrl) : null;
    const label = host ?? friendlyProvider(account.apiProvider!);
    return {
      mode: "api",
      label,
      plan: apiPlanLabel(host, account.apiProvider),
    };
  }

  return null;
}
