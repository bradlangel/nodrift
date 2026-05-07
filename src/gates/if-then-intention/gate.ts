import {
  AccessGate,
  AccessGateDecision,
  LocalIntentAccessRequestContext,
} from "../../core/access-contracts.js";
import {
  clampRequestedMinutes,
  failDecision,
  normalizeGateText,
  pickRequestedUrl,
  resolveHostAndRules,
} from "../shared/access-request.js";

const REQUIRED_PATTERNS = [
  /\bi am using\b|\bi'm using\b|\busing this site\b/i,
  /\bi will stop\b|\bstop when\b|\bdone when\b/i,
  /\bif i\b|\bif\b/i,
  /\bthen i\b|\bthen\b/i,
];

const hasIntentionShape = (value: string): boolean =>
  REQUIRED_PATTERNS.every((pattern) => pattern.test(value));

const hasEnoughSubstance = (value: string): boolean =>
  value
    .split(/\n|\.|;/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8).length >= 3;

export const ifThenIntentionGate: AccessGate<LocalIntentAccessRequestContext> = {
  id: "if-then-intention-access",
  decide: (context): AccessGateDecision => {
    const minutes = clampRequestedMinutes(
      Number(context.requestedMinutes),
      context.defaultMinutes
    );
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return failDecision(minutes, "I couldn't determine which blocked site to allow.");
    }

    const plan = normalizeGateText(context.requestedPurpose);
    if (!plan) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "Write a purpose, stop condition, and if/then drift plan.",
      };
    }

    if (!hasIntentionShape(plan) || !hasEnoughSubstance(context.requestedPurpose)) {
      return failDecision(
        minutes,
        "Use the full template: purpose, stop condition, if trigger, and then response.",
        host,
        ruleIds
      );
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: pickRequestedUrl(context),
      ruleIds,
      message: "Approved with your intention receipt in place.",
    };
  },
};
