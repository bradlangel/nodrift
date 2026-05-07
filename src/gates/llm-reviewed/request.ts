import type { AccessReviewProgressStage } from "../../core/access-contracts.js";
import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { llmReviewedAccessGate } from "./gate.js";
import {
  getLlmModelLabel,
  getLlmProviderSettings,
} from "./provider-settings.js";
import {
  hasChromeLocalProviderConfig,
  requestChromeLocalAccessReview,
} from "./providers/chrome-local.js";
import {
  hasOpenAiProviderConfig,
  requestOpenAiAccessReview,
} from "./providers/openai.js";

export const decideLlmReviewedRequest = async (
  input: RequestGateInput,
  onProgress?: (stage: AccessReviewProgressStage) => void
): Promise<RequestGateDecisionResult> => {
  onProgress?.("preparing");

  const provider = await getLlmProviderSettings();
  const modelLabel = getLlmModelLabel(provider);

  if (!hasOpenAiProviderConfig(provider) && !hasChromeLocalProviderConfig(provider)) {
    return {
      provider: provider.provider,
      model: modelLabel,
      decision: {
        decision: "FAIL",
        scope: "none",
        minutes: input.defaultMinutes,
        host: null,
        url: null,
        ruleIds: [],
        message: "LLM-reviewed request is selected, but provider settings are incomplete.",
      },
    };
  }

  const requestedPurpose =
    typeof input.requestedText === "string" ? input.requestedText : "";
  const followUpCount = Math.max(0, Number(input.followUpCount) || 0);

  let modelDecision: unknown;
  try {
    const requestedUrl = input.requestedUrl ?? null;
    const reviewContext = {
      blockedDomain: input.currentSite || "unknown",
      requestedUrl,
      requestedPurpose,
      requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
      reviewStrictnessLevel: provider.reviewStrictnessLevel,
      leisureAllowanceLevel: provider.leisureAllowanceLevel,
      followUpAnswer: input.followUpAnswer,
      followUpCount,
      currentTimeIso: new Date().toISOString(),
      dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
      stats: input.stats,
    };
    modelDecision = hasChromeLocalProviderConfig(provider)
      ? await requestChromeLocalAccessReview(reviewContext, onProgress)
      : await (async () => {
          onProgress?.("reviewing");
          return requestOpenAiAccessReview(provider.apiKey, provider.model, reviewContext);
        })();
    onProgress?.("finalizing");
  } catch (error) {
    console.warn("llm-reviewed-access request failed", error);
    const message =
      error instanceof Error && error.message
        ? `The LLM review could not run: ${error.message}`
        : "The LLM review is temporarily unavailable. Please try again shortly.";
    return {
      provider: provider.provider,
      model: modelLabel,
      decision: {
        decision: "FAIL",
        scope: "none",
        minutes: input.defaultMinutes,
        host: null,
        url: null,
        ruleIds: [],
        message,
      },
    };
  }

  return {
    provider: provider.provider,
    model: modelLabel,
    decision: llmReviewedAccessGate.decide({
      rawUrl: input.rawUrl,
      requestedScope: "domain",
      requestedUrl: input.requestedUrl,
      blockedSites: input.blockedSites,
      defaultMinutes: input.defaultMinutes,
      requestedPurpose,
      requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
      currentUrl: input.requestedUrl,
      currentSite: input.currentSite,
      followUpAnswer: input.followUpAnswer,
      followUpCount,
      maxMinutes: input.defaultMinutes,
      modelDecision,
      stats: input.stats,
    }),
  };
};
