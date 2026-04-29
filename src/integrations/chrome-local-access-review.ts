import { DailyStatsContext } from "../core/access-contracts.js";
import {
  buildAccessReviewPolicy,
  LlmReviewLevel,
  normalizeReviewLevel,
} from "./access-review-policy.js";

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
  globalStatsToday: stats?.globalStatsToday ?? {
    blockedAttemptsToday: stats?.blockedAttemptsToday ?? 0,
    temporaryAllowsToday: stats?.temporaryAllowsToday ?? 0,
    temporaryAllowUsedSecondsToday: stats?.temporaryAllowUsedSecondsToday ?? 0,
  },
  currentSiteStatsToday: stats?.currentSiteStatsToday ?? null,
  categorySummaryToday: stats?.categorySummaryToday ?? {},
  recentSiteDecisions: Array.isArray(stats?.recentSiteDecisions)
    ? stats?.recentSiteDecisions.slice(0, 5)
    : [],
  lastAccessByCategory: stats?.lastAccessByCategory ?? {},
  lastAccessBySite: stats?.lastAccessBySite ?? null,
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

const formatBulletList = (items: string[]): string =>
  items.map((item, index) => `${index + 1}. ${item}`).join("\n");

const formatExamples = (examples: ReturnType<typeof buildAccessReviewPolicy>["examples"]): string =>
  examples
    .map(
      (example, index) =>
        [
          `Example ${index + 1}`,
          `Purpose: ${JSON.stringify(example.requestedPurpose)}`,
          `Output: ${JSON.stringify({
            decision: example.decision,
            scope: example.scope,
            minutes: example.minutes,
            message: example.message,
            followUpQuestion: null,
          })}`,
        ].join("\n")
    )
    .join("\n\n");

export const buildChromeLocalPrompt = (context: ChromeLocalAccessReviewContext): string => {
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
  const policy = buildAccessReviewPolicy(reviewStrictnessLevel, leisureAllowanceLevel);

  return [
    "You review temporary access requests for a soft website blocker.",
    "Return exactly one valid JSON object and nothing else.",
    "Do not use markdown, code fences, comments, trailing commas, or unquoted keys.",
    "Use double quotes for every JSON key and string value. Escape any double quotes inside string values.",
    "",
    "Required JSON shape:",
    '{"decision":"FAIL","scope":"none","minutes":0,"message":"Denied because ...","followUpQuestion":null}',
    "",
    `Task: ${policy.task}`,
    "",
    "Constraints:",
    formatBulletList(policy.constraints),
    "",
    "Rubric:",
    formatBulletList(policy.rubric),
    "",
    "Examples:",
    formatExamples(policy.examples),
    "",
    "Request:",
    JSON.stringify(
      {
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
      null,
      2
    ),
    "",
    "Return only the final JSON object now. The first character must be { and the last character must be }.",
  ].join("\n");
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
