import { DailyStatsContext } from "../core/access-contracts.js";
import {
  buildAccessReviewPolicy,
  LlmReviewLevel,
  normalizeReviewLevel,
} from "./access-review-policy.js";

export { LlmReviewLevel, normalizeReviewLevel } from "./access-review-policy.js";

export type OpenAiAccessReviewContext = {
  blockedDomain: string;
  requestedUrl: string | null;
  requestedPurpose: string;
  requestedMinutes: number;
  reviewStrictnessLevel?: LlmReviewLevel;
  leisureAllowanceLevel?: LlmReviewLevel;
  followUpAnswer?: string | null;
  followUpCount: number;
  currentTimeIso: string;
  dayOfWeek: string;
  stats?: DailyStatsContext;
};

export const hasOpenAiProviderConfig = (config: {
  provider: string;
  model: string;
  apiKey: string;
}): boolean => config.provider === "openai" && !!config.model.trim() && !!config.apiKey.trim();

const ACCESS_REVIEW_MAX_OUTPUT_TOKENS = 300;

export const buildOpenAiStatsSnippet = (stats?: DailyStatsContext) => ({
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

export const getOpenAiAccessReviewReasoningEffort = (model: string): string | null => {
  const normalizedModel = model.trim().toLowerCase();
  if (/^gpt-5\.[12](?:-|$)/.test(normalizedModel)) return "none";
  if (/^gpt-5(?:-|$)/.test(normalizedModel)) return "minimal";
  if (/^o[134](?:-|$)/.test(normalizedModel)) return "low";
  return null;
};

const supportsOpenAiTextVerbosity = (model: string): boolean => /^gpt-5(?:[.-]|$)/.test(model.trim().toLowerCase());

export const extractOpenAiOutputText = (data: unknown): string | null => {
  const response = data as any;
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) return null;

  for (const outputItem of response.output) {
    if (!Array.isArray(outputItem?.content)) continue;

    const textEntry = outputItem.content.find((entry: any) => entry?.type === "output_text");
    if (typeof textEntry?.text === "string" && textEntry.text.trim()) {
      return textEntry.text;
    }
  }

  return null;
};

export const requestOpenAiAccessReview = async (
  apiKey: string,
  model: string,
  context: OpenAiAccessReviewContext
): Promise<unknown> => {
  const reasoningEffort = getOpenAiAccessReviewReasoningEffort(model);
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
  const policy = buildAccessReviewPolicy(reviewStrictnessLevel, leisureAllowanceLevel);
  const textConfig = {
    ...(supportsOpenAiTextVerbosity(model) ? { verbosity: "low" } : {}),
    format: {
      type: "json_schema",
      name: "access_gate_decision",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          decision: { type: "string", enum: ["PASS", "PASS_WITH_LIMIT", "FAIL"] },
          scope: {
            type: "string",
            enum: ["domain", "url", "none"],
          },
          minutes: { type: "number" },
          message: { type: "string" },
          followUpQuestion: { type: ["string", "null"] },
        },
        required: ["decision", "scope", "minutes", "message", "followUpQuestion"],
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: ACCESS_REVIEW_MAX_OUTPUT_TOKENS,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You review temporary access requests for a soft website blocker. Reply with valid JSON only.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                ...policy,
                request: {
                  blockedDomain: context.blockedDomain,
                  requestedUrl: context.requestedUrl,
                  requestedPurpose: context.requestedPurpose,
                  requestedMinutes: context.requestedMinutes,
                  reviewStrictnessLevel,
                  leisureAllowanceLevel,
                  currentTimeIso: context.currentTimeIso,
                  dayOfWeek: context.dayOfWeek,
                  stats: buildOpenAiStatsSnippet(context.stats),
                },
              }),
            },
          ],
        },
      ],
      text: textConfig,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  const maybeText = extractOpenAiOutputText(data);
  if (typeof maybeText === "string" && maybeText.trim()) {
    return maybeText;
  }

  throw new Error("Provider response did not contain structured output text.");
};
