import {
  AccessDecisionScope,
  AccessRequestContext,
  AccessGateDecision,
} from "./core/access-contracts.js";
import { getRelatedRuleIdsForHost, hostMatchesSite } from "./site-matching.js";
import { ensureHttpUrl, normalizeHost, parseHostnameFromUrl } from "./url-domain.js";

export type TemporaryAccessDecision = AccessGateDecision;
type BuildTemporaryAllowDecisionInput = AccessRequestContext;

const getRuleIdFromUrl = (url: URL): number | null => {
  const rawRuleId = url.searchParams.get("rid");
  if (!rawRuleId) return null;
  const ruleId = Number(rawRuleId);
  return Number.isInteger(ruleId) && ruleId > 0 ? ruleId : null;
};

const getTemporaryAllowHostFromUrl = (url: URL): string | null => {
  const siteParam = normalizeHost(url.searchParams.get("site"));
  if (siteParam) return siteParam;
  return parseHostnameFromUrl(url.toString());
};

export const buildTemporaryAllowDecision = (
  input: BuildTemporaryAllowDecisionInput
): TemporaryAccessDecision => {
  const minutes = Math.max(Math.floor(input.defaultMinutes), 0);
  const fail = (message: string): AccessGateDecision => ({
    decision: "FAIL",
    scope: "none",
    minutes,
    host: null,
    url: null,
    ruleIds: [],
    message,
  });

  if (!input.rawUrl) return fail("Missing URL for temporary allow.");

  let url: URL;
  try {
    url = new URL(input.rawUrl);
  } catch {
    return fail("Invalid URL for temporary allow.");
  }

  const ruleId = getRuleIdFromUrl(url);
  const hostFromRule =
    ruleId !== null ? normalizeHost(input.blockedSites[ruleId - 1]) : null;
  const host = hostFromRule ?? getTemporaryAllowHostFromUrl(url);
  if (!host) return fail("Could not resolve host for temporary allow.");

  const ruleIds = getRelatedRuleIdsForHost(host, input.blockedSites);
  if (ruleIds.length === 0) return fail("No matching blocked rules to allow.");

  const requestedScope = input.requestedScope ?? "domain";
  if (requestedScope === "url") {
    const requestedUrl = input.requestedUrl ? ensureHttpUrl(input.requestedUrl) : null;
    if (!requestedUrl) return fail("Could not resolve URL for temporary allow.");
    const requestedHost = parseHostnameFromUrl(requestedUrl);
    if (!hostMatchesSite(requestedHost, host)) {
      return fail("Requested URL does not match blocked host.");
    }
    return {
      decision: "PASS",
      scope: "url",
      minutes,
      host,
      url: requestedUrl,
      ruleIds,
    };
  }

  return {
    decision: "PASS",
    scope: "domain",
    minutes,
    host,
    url: null,
    ruleIds,
  };
};
