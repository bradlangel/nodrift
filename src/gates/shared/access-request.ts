import { AccessGateDecision, AccessRequestContext } from "../../core/access-contracts.js";
import { getRelatedRuleIdsForHost } from "../../site-matching.js";
import { ensureHttpUrl, normalizeHost, parseHostnameFromUrl } from "../../url-domain.js";

export const MINUTES_FLOOR = 5;
export const MINUTES_CEILING = 45;

export const normalizeGateText = (value: string | null | undefined): string =>
  (value || "").replace(/\s+/g, " ").trim();

export const clampRequestedMinutes = (
  requestedMinutes: number,
  fallbackMinutes: number,
  ceiling = MINUTES_CEILING
): number => {
  const raw = Number.isFinite(requestedMinutes) ? requestedMinutes : fallbackMinutes;
  const bounded = Math.max(Math.floor(raw || 0), MINUTES_FLOOR);
  return Math.min(bounded, ceiling);
};

export const resolveHostAndRules = (
  context: AccessRequestContext
): { host: string | null; ruleIds: number[] } => {
  if (!context.rawUrl) {
    return { host: null, ruleIds: [] };
  }

  try {
    const parsed = new URL(context.rawUrl);
    const rid = Number(parsed.searchParams.get("rid"));
    const ruleIdHost =
      Number.isInteger(rid) && rid > 0 ? normalizeHost(context.blockedSites[rid - 1]) : null;
    const siteHost = normalizeHost(parsed.searchParams.get("site"));
    const requestedHost = parseHostnameFromUrl(context.requestedUrl || "");
    const host = ruleIdHost || siteHost || requestedHost;
    const ruleIds = host ? getRelatedRuleIdsForHost(host, context.blockedSites) : [];
    return { host: host || null, ruleIds };
  } catch {
    return { host: null, ruleIds: [] };
  }
};

export const pickRequestedUrl = (context: AccessRequestContext): string | null =>
  ensureHttpUrl(context.requestedUrl);

export const failDecision = (
  minutes: number,
  message: string,
  host: string | null = null,
  ruleIds: number[] = []
): AccessGateDecision => ({
  decision: "FAIL",
  scope: "none",
  minutes,
  host,
  url: null,
  ruleIds,
  message,
});
