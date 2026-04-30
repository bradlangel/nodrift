import { AccessGateDecision } from "../../core/access-contracts.js";
import { hostMatchesSite } from "../../site-matching.js";
import { parseHostnameFromUrl } from "../../url-domain.js";

type ModelDecision = {
  decision?: unknown;
  scope?: unknown;
  minutes?: unknown;
  message?: unknown;
  followUpQuestion?: unknown;
};

export type LlmDecisionValidationContext = {
  host: string | null;
  ruleIds: number[];
  requestedUrl: string | null;
  requestedMinutes: number;
  defaultMinutes: number;
  maxMinutes: number;
  followUpCount: number;
  requestedPurpose: string;
};

const DEFAULT_FAIL_MESSAGE = "I couldn't safely approve this request right now.";
const DEFAULT_FOLLOWUP_MESSAGE = "One quick follow-up: what exact outcome do you need?";

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
};

const sanitizeMessage = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const clampMinutes = (value: number, maxMinutes: number): number => {
  const max = Number.isFinite(maxMinutes) ? Math.max(1, Math.floor(maxMinutes)) : 30;
  const rounded = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(max, Math.max(1, rounded));
};

const shouldPreferUrlScope = (context: LlmDecisionValidationContext): boolean => {
  const url = context.requestedUrl;
  if (!url || !context.host) return false;
  const requestedHost = parseHostnameFromUrl(url);
  if (!requestedHost || !hostMatchesSite(requestedHost, context.host)) return false;
  return /\b(this page|specific page|exact page|that page|single page|one page|url)\b/i.test(
    context.requestedPurpose || ""
  );
};

const isSiteRootUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (parsed.pathname === "" || parsed.pathname === "/") && !parsed.search;
  } catch {
    return false;
  }
};

const failClosed = (
  context: LlmDecisionValidationContext,
  message = DEFAULT_FAIL_MESSAGE
): AccessGateDecision => ({
  decision: "FAIL",
  scope: "none",
  minutes: clampMinutes(context.defaultMinutes, context.maxMinutes),
  host: null,
  url: null,
  ruleIds: [],
  message,
});

const failWithModelReason = (
  context: LlmDecisionValidationContext,
  parsed: ModelDecision | null,
  fallback: string
): AccessGateDecision =>
  failClosed(context, sanitizeMessage(parsed?.message, fallback));

export const validateLlmReviewedDecision = (
  rawDecision: unknown,
  context: LlmDecisionValidationContext
): AccessGateDecision => {
  if (!context.host || context.ruleIds.length === 0) {
    return failClosed(context, "I couldn't determine which blocked site to allow.");
  }

  const parsed = asObject(rawDecision) as ModelDecision | null;
  if (!parsed) {
    return failClosed(
      context,
      "The provider did not return readable decision JSON, so access stayed blocked."
    );
  }

  const decision = typeof parsed.decision === "string" ? parsed.decision : "";
  const requestedBaseMinutes = Number.isFinite(context.requestedMinutes)
    ? context.requestedMinutes
    : context.defaultMinutes;
  const parsedMinutes = typeof parsed.minutes === "number" ? parsed.minutes : requestedBaseMinutes;
  const minutes = clampMinutes(parsedMinutes, context.maxMinutes);

  if (decision === "ASK_FOLLOWUP") {
    if (context.followUpCount >= 1) {
      return failClosed(context, "I still can't approve this request without enough detail.");
    }
    return {
      decision: "ASK_FOLLOWUP",
      scope: "none",
      minutes,
      host: context.host,
      url: null,
      ruleIds: context.ruleIds,
      message: sanitizeMessage(parsed.followUpQuestion ?? parsed.message, DEFAULT_FOLLOWUP_MESSAGE),
    };
  }

  if (decision === "FAIL") {
    return {
      decision: "FAIL",
      scope: "none",
      minutes,
      host: null,
      url: null,
      ruleIds: [],
      message: sanitizeMessage(parsed.message, "Staying blocked for now."),
    };
  }

  if (decision !== "PASS" && decision !== "PASS_WITH_LIMIT") {
    return failWithModelReason(
      context,
      parsed,
      "The provider did not return a valid approve/deny decision, so access stayed blocked."
    );
  }

  const modelScope = parsed.scope === "url" || parsed.scope === "domain" ? parsed.scope : "domain";
  const preferUrlScope = shouldPreferUrlScope(context);
  const canUseUrlScope = !!context.requestedUrl && !isSiteRootUrl(context.requestedUrl);
  const scope = (preferUrlScope || modelScope === "url") && canUseUrlScope ? "url" : "domain";

  return {
    decision,
    scope,
    minutes,
    host: context.host,
    url: scope === "url" ? context.requestedUrl : null,
    ruleIds: context.ruleIds,
    message: sanitizeMessage(parsed.message, "Approved."),
  };
};
