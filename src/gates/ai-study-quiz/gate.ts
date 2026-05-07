import {
  AccessGate,
  AccessGateDecision,
  AiStudyQuizAccessRequestContext,
} from "../../core/access-contracts.js";
import {
  clampRequestedMinutes,
  failDecision,
  normalizeGateText,
  pickRequestedUrl,
  resolveHostAndRules,
} from "../shared/access-request.js";
import { areCorrectQuizAnswers } from "./quiz.js";

export const aiStudyQuizGate: AccessGate<AiStudyQuizAccessRequestContext> = {
  id: "ai-study-quiz-access",
  decide: (context): AccessGateDecision => {
    const minutes = clampRequestedMinutes(
      Number(context.requestedMinutes),
      context.defaultMinutes,
      30
    );
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return failDecision(minutes, "I couldn't determine which blocked site to allow.");
    }

    if (!normalizeGateText(context.topic)) {
      return failDecision(minutes, "Choose a study topic first.", host, ruleIds);
    }

    if (!context.expectedAnswers?.length || context.expectedAnswers.length < 2) {
      return failDecision(minutes, "The quiz question was not ready yet.", host, ruleIds);
    }

    if (!areCorrectQuizAnswers(context.answer, context.expectedAnswers)) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: `Answer all ${context.expectedAnswers.length} questions correctly to continue.`,
      };
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: pickRequestedUrl(context),
      ruleIds,
      message: "All quiz answers were correct. Approved after study practice.",
    };
  },
};
