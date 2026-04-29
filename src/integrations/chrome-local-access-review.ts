import { DailyStatsContext } from "../core/access-contracts.js";
import { LlmReviewLevel, normalizeReviewLevel } from "./openai-access-review.js";

type ChromeLocalAccessReviewContext = {
  blockedDomain: string;
  requestedUrl: string | null;
  requestedPurpose: string;
  requestedMinutes: number;
  reviewStrictnessLevel?: LlmReviewLevel;
  leisureAllowanceLevel?: LlmReviewLevel;
  currentTimeIso: string;
  dayOfWeek: string;
  stats?: DailyStatsContext;
};

const LANGUAGE_MODEL_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const buildStatsSnippet = (stats?: DailyStatsContext) => ({
  blockedAttemptsToday: stats?.blockedAttemptsToday ?? 0,
  temporaryAllowsToday: stats?.temporaryAllowsToday ?? 0,
  temporaryAllowUsedSecondsToday: stats?.temporaryAllowUsedSecondsToday ?? 0,
  recentSiteDecisions: Array.isArray(stats?.recentSiteDecisions)
    ? stats?.recentSiteDecisions.slice(0, 5)
    : [],
});

const extractJsonObjectText = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return extractJsonObjectText(fenced[1]);

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
};

const buildReviewGuidance = (
  strictnessLevel: LlmReviewLevel,
  leisureAllowanceLevel: LlmReviewLevel
): string[] => [
  "Return JSON only. No markdown, prose, or code fences.",
  'The response must look like {"decision":"FAIL","scope":"none","minutes":0,"message":"Denied because ...","followUpQuestion":null}.',
  "Use exactly one decision: PASS, PASS_WITH_LIMIT, or FAIL.",
  "Do not ask follow-up questions; this flow has one input and needs a terminal decision.",
  "Use domain scope when the user needs to browse the site, open comment sections, follow internal links, or requestedUrl is the site homepage.",
  "Use url scope only when the request is clearly for one exact page.",
  "The message field must explain the concrete reason for your decision in one short sentence.",
  "If you approve, the message must say why the request was specific enough.",
  "If you deny, the message must say what detail is missing or what boundary was crossed.",
  `Purpose scrutiny level is ${strictnessLevel} of 5.`,
  `Leisure allowance level is ${leisureAllowanceLevel} of 5.`,
  "Purpose scrutiny 1 means light review; 3 means balanced review; 5 means require a clear, necessary, well-bounded purpose.",
  "Leisure allowance 1 means leisure is rarely approved; 3 means planned leisure can pass when specific and time-boxed; 5 means leisure can pass easily if still concrete and bounded.",
  "When the purpose is vague, return FAIL with a short reason.",
];

const buildChromeLocalPrompt = (context: ChromeLocalAccessReviewContext): string => {
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
  return JSON.stringify({
    role: "temporary_access_reviewer",
    outputSchema: {
      decision: "PASS | PASS_WITH_LIMIT | FAIL",
      scope: "domain | url | none",
      minutes: "number",
      message: "short reason",
      followUpQuestion: null,
    },
    constraints: buildReviewGuidance(reviewStrictnessLevel, leisureAllowanceLevel),
    request: {
      blockedDomain: context.blockedDomain,
      requestedUrl: context.requestedUrl,
      requestedPurpose: context.requestedPurpose,
      requestedMinutes: context.requestedMinutes,
      reviewStrictnessLevel,
      leisureAllowanceLevel,
      currentTimeIso: context.currentTimeIso,
      dayOfWeek: context.dayOfWeek,
      stats: buildStatsSnippet(context.stats),
    },
  });
};

export const hasChromeLocalProviderConfig = (config: { provider: string }): boolean =>
  config.provider === "chrome-local";

export const requestChromeLocalAccessReview = async (
  context: ChromeLocalAccessReviewContext
): Promise<unknown> => {
  const languageModel = (globalThis as any).LanguageModel;
  if (!languageModel?.availability || !languageModel?.create) {
    throw new Error("Chrome local LLM is not available in this browser.");
  }

  const availability = await languageModel.availability(LANGUAGE_MODEL_OPTIONS);
  if (availability === "unavailable") {
    throw new Error("Chrome local LLM is unavailable on this device or Chrome profile.");
  }

  let session: any = null;
  try {
    session = await languageModel.create(LANGUAGE_MODEL_OPTIONS);
    const result = await session.prompt(buildChromeLocalPrompt(context));
    if (typeof result !== "string" || !result.trim()) {
      throw new Error("Chrome local LLM returned an empty response.");
    }
    return extractJsonObjectText(result);
  } finally {
    session?.destroy?.();
  }
};
