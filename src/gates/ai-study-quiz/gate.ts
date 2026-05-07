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
import { isCorrectQuizAnswer } from "./quiz.js";

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

    if (!context.expectedAnswers?.length) {
      return failDecision(minutes, "The quiz question was not ready yet.", host, ruleIds);
    }

    if (!isCorrectQuizAnswer(context.answer, context.expectedAnswers)) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "That answer was not correct yet. Try the question again.",
      };
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: pickRequestedUrl(context),
      ruleIds,
      message: "Correct. Approved after study practice.",
    };
  },
};
