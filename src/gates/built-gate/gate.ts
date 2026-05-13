import {
  AccessGate,
  AccessGateDecision,
  BuiltGateAccessRequestContext,
} from "../../core/access-contracts.js";
import {
  clampRequestedMinutes,
  failDecision,
  normalizeGateText,
  pickRequestedUrl,
  resolveHostAndRules,
} from "../shared/access-request.js";

const normalizeSearchText = (value: string | null | undefined): string =>
  normalizeGateText(value).toLowerCase();

const containsAny = (value: string, keywords: string[]): boolean =>
  keywords.some((keyword) => keyword && value.includes(keyword.toLowerCase()));

const hasAnsweredEachQuestion = (
  requestedPurpose: string,
  questions: string[],
  minChars: number
): boolean => {
  const lines = requestedPurpose
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  return questions.every((question) => {
    const label = question.replace(/[:?.!\s]+$/g, "").trim().toLowerCase();
    const matchingLine = lines.find((line) => line.toLowerCase().startsWith(label));
    const answer = matchingLine
      ? matchingLine.slice(label.length).replace(/^[:\s._-]+/, "").trim()
      : "";
    return answer.length >= minChars;
  });
};

export const builtGate: AccessGate<BuiltGateAccessRequestContext> = {
  id: "built-gate-access",
  decide: (context): AccessGateDecision => {
    const maxMinutes = Math.min(context.defaultMinutes, context.spec.maxMinutes);
    const minutes = clampRequestedMinutes(
      Number(context.requestedMinutes),
      maxMinutes,
      maxMinutes
    );
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return failDecision(minutes, "I couldn't determine which blocked site to allow.");
    }

    const searchText = normalizeSearchText(context.requestedPurpose);
    const answered = hasAnsweredEachQuestion(
      context.requestedPurpose,
      context.spec.questions,
      context.spec.requiredAnswerMinChars
    );
    const blocked = containsAny(searchText, context.spec.denyKeywords);
    const purposeful = containsAny(searchText, context.spec.approveKeywords);

    if (!answered || blocked || !purposeful) {
      return failDecision(minutes, context.spec.failureMessage, host, ruleIds);
    }

    const preferUrlScope = containsAny(searchText, context.spec.urlScopeKeywords);
    const url = pickRequestedUrl(context);

    return {
      decision: preferUrlScope && url ? "PASS_WITH_LIMIT" : "PASS",
      scope: preferUrlScope && url ? "url" : "domain",
      minutes,
      host,
      url,
      ruleIds,
      message: context.spec.successMessage,
    };
  },
};
