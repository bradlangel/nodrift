import { AccessGate, LlmReviewedAccessRequestContext } from "../core/access-contracts.js";
import { getRelatedRuleIdsForHost } from "../site-matching.js";
import { ensureHttpUrl, normalizeHost, parseHostnameFromUrl } from "../url-domain.js";
import { validateLlmReviewedDecision } from "./llm-reviewed-decision.js";

const resolveHostAndRules = (
  context: LlmReviewedAccessRequestContext
): { host: string | null; ruleIds: number[] } => {
  if (!context.rawUrl) {
    return { host: null, ruleIds: [] };
  }

  try {
    const parsed = new URL(context.rawUrl);
    const rid = Number(parsed.searchParams.get("rid"));
    const ruleIdHost = Number.isInteger(rid) && rid > 0
      ? normalizeHost(context.blockedSites[rid - 1])
      : null;
    const siteHost = normalizeHost(parsed.searchParams.get("site"));
    const host = ruleIdHost || siteHost || parseHostnameFromUrl(context.currentUrl || "");
    const ruleIds = host ? getRelatedRuleIdsForHost(host, context.blockedSites) : [];
    return { host: host || null, ruleIds };
  } catch {
    return { host: null, ruleIds: [] };
  }
};

const pickRequestedUrl = (context: LlmReviewedAccessRequestContext): string | null => {
  const currentUrl = ensureHttpUrl(context.currentUrl);
  if (currentUrl) return currentUrl;
  return ensureHttpUrl(context.requestedUrl);
};

export const llmReviewedAccessGate: AccessGate<LlmReviewedAccessRequestContext> = {
  id: "llm-reviewed-access",
  decide: (context) => {
    const { host, ruleIds } = resolveHostAndRules(context);
    const requestedUrl = pickRequestedUrl(context);

    return validateLlmReviewedDecision(context.modelDecision, {
      host,
      ruleIds,
      requestedUrl,
      requestedMinutes: context.requestedMinutes,
      defaultMinutes: context.defaultMinutes,
      maxMinutes: context.maxMinutes,
      followUpCount: context.followUpCount || 0,
      requestedPurpose: context.requestedPurpose,
    });
  },
};
