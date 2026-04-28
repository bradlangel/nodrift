import {
  AccessGate,
  AccessGateDecision,
  LocalIntentAccessRequestContext,
} from "../core/access-contracts.js";
import { getRelatedRuleIdsForHost, hostMatchesSite } from "../site-matching.js";
import { ensureHttpUrl, normalizeHost, parseHostnameFromUrl } from "../url-domain.js";

const MINUTES_FLOOR = 5;
const MINUTES_CEILING = 45;

const DELIBERATE_KEYWORDS = [
  "work",
  "meeting",
  "ticket",
  "debug",
  "fix",
  "research",
  "learn",
  "study",
  "read",
  "course",
  "documentation",
  "docs",
  "errand",
  "bill",
  "bank",
  "maintenance",
  "plan",
  "exercise",
  "rest",
  "downtime",
  "watch",
  "specific",
  "article",
  "video",
  "message",
  "reply",
  "support",
];

const VAGUE_KEYWORDS = [
  "i need it",
  "need this",
  "checking",
  "check something",
  "real quick",
  "quick check",
  "just a minute",
  "not sure",
  "maybe",
];

const AUTOPILOT_KEYWORDS = [
  "scroll",
  "doomscroll",
  "waste time",
  "bored",
  "just because",
  "autopilot",
  "kill time",
  "procrastinate",
  "random",
];

const PASS_WITH_LIMIT_HINTS = [
  "this page",
  "that page",
  "exact page",
  "specific page",
  "article",
  "thread",
  "post",
  "video",
  "issue",
  "pull request",
  "docs",
  "documentation",
  "link",
];

const containsAny = (value: string, keywords: string[]): boolean =>
  keywords.some((keyword) => value.includes(keyword));

const normalizeText = (value: string | null | undefined): string =>
  (value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const baseFail = (minutes: number, message: string): AccessGateDecision => ({
  decision: "FAIL",
  scope: "none",
  minutes,
  host: null,
  url: null,
  ruleIds: [],
  message,
});

const resolveHostAndRules = (
  context: LocalIntentAccessRequestContext
): { host: string | null; ruleIds: number[]; ruleIdHost: string | null } => {
  if (!context.rawUrl) {
    return { host: null, ruleIds: [], ruleIdHost: null };
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
    return { host: host || null, ruleIds, ruleIdHost };
  } catch {
    return { host: null, ruleIds: [], ruleIdHost: null };
  }
};

const pickRequestedUrl = (context: LocalIntentAccessRequestContext): string | null => {
  const currentUrl = ensureHttpUrl(context.currentUrl);
  if (currentUrl) return currentUrl;
  return ensureHttpUrl(context.requestedUrl);
};

const minutesFromRequest = (requestedMinutes: number): number => {
  const bounded = Math.max(Math.floor(requestedMinutes || 0), MINUTES_FLOOR);
  return Math.min(bounded, MINUTES_CEILING);
};

export const localIntentAccessGate: AccessGate<LocalIntentAccessRequestContext> = {
  id: "local-intent-access",
  decide: (context) => {
    const requestedPurpose = normalizeText(context.requestedPurpose);
    const followUpAnswer = normalizeText(context.followUpAnswer);
    const minutes = minutesFromRequest(context.requestedMinutes || context.defaultMinutes);
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return baseFail(minutes, "I couldn't determine which blocked site to allow.");
    }

    if (!requestedPurpose && !followUpAnswer) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "What exactly do you want to do there right now?",
      };
    }

    const combinedIntent = `${requestedPurpose} ${followUpAnswer}`.trim();

    if (containsAny(combinedIntent, AUTOPILOT_KEYWORDS)) {
      return baseFail(minutes, "That sounds like autopilot use. Try again with a specific plan.");
    }

    const looksVague = containsAny(combinedIntent, VAGUE_KEYWORDS) && combinedIntent.length < 50;

    if (looksVague && !followUpAnswer) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "What specific task or page do you need?",
      };
    }

    const requestedUrl = pickRequestedUrl(context);
    const requestedHost = parseHostnameFromUrl(requestedUrl || "");
    const canUseUrlScope = requestedUrl && !!requestedHost && hostMatchesSite(requestedHost, host);

    const looksSpecific = /\b(for|to|about|because|finish|review|debug|read|watch|reply|pay)\b/.test(
      combinedIntent
    );
    const deliberate = containsAny(combinedIntent, DELIBERATE_KEYWORDS) || looksSpecific;

    if (!deliberate) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "What outcome should this access help you complete?",
      };
    }

    const shouldPreferUrlScope = canUseUrlScope && containsAny(combinedIntent, PASS_WITH_LIMIT_HINTS);
    const wasLimited = Math.floor(context.requestedMinutes || 0) > minutes;

    if (shouldPreferUrlScope) {
      return {
        decision: "PASS_WITH_LIMIT",
        scope: "url",
        minutes: Math.min(minutes, 20),
        host,
        url: requestedUrl,
        ruleIds,
        message: "Approved for this page with a short timer.",
      };
    }

    if (wasLimited) {
      return {
        decision: "PASS_WITH_LIMIT",
        scope: "domain",
        minutes,
        host,
        url: null,
        ruleIds,
        message: `Approved with a ${minutes}-minute limit.`,
      };
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: null,
      ruleIds,
      message: "Approved. Keep it focused.",
    };
  },
};
