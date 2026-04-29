import { DailyStatsContext } from "../core/access-contracts.js";

export type OpenAiAccessReviewContext = {
  blockedDomain: string;
  requestedUrl: string | null;
  requestedPurpose: string;
  requestedMinutes: number;
  reviewStrictness?: LlmReviewStrictness;
  followUpAnswer?: string | null;
  followUpCount: number;
  currentTimeIso: string;
  dayOfWeek: string;
  stats?: DailyStatsContext;
};

export type LlmReviewStrictness = "lenient" | "balanced" | "strict";

export const hasOpenAiProviderConfig = (config: {
  provider: string;
  model: string;
  apiKey: string;
}): boolean => config.provider === "openai" && !!config.model.trim() && !!config.apiKey.trim();

const ACCESS_REVIEW_MAX_OUTPUT_TOKENS = 300;

const buildStatsSnippet = (stats?: DailyStatsContext) => ({
  blockedAttemptsToday: stats?.blockedAttemptsToday ?? 0,
  temporaryAllowsToday: stats?.temporaryAllowsToday ?? 0,
  temporaryAllowUsedSecondsToday: stats?.temporaryAllowUsedSecondsToday ?? 0,
  recentSiteDecisions: Array.isArray(stats?.recentSiteDecisions)
    ? stats?.recentSiteDecisions.slice(0, 5)
    : [],
});

const normalizeReviewStrictness = (strictness: unknown): LlmReviewStrictness =>
  strictness === "lenient" || strictness === "strict" ? strictness : "balanced";

const buildReviewStrictnessInstructions = (strictness: LlmReviewStrictness): string[] => {
  const shared = [
    "Treat vague purposes such as just for fun, bored, scroll, browse, check stuff, or kill time as insufficient.",
    "Legitimate downtime can be approved only when the user gives a concrete activity and time box.",
    "When the purpose is vague and followUpCount is 0, prefer ASK_FOLLOWUP unless strictness says to fail immediately.",
    "When the purpose remains vague after one follow-up, return FAIL.",
  ];

  if (strictness === "strict") {
    return [
      ...shared,
      "Strict mode: approve only clearly necessary work, errands, maintenance, learning, debugging, or explicitly planned leisure.",
      "Strict mode: return FAIL for casual, vague, novelty, or open-ended entertainment requests instead of asking a follow-up.",
    ];
  }

  if (strictness === "lenient") {
    return [
      ...shared,
      "Lenient mode: approve plausible deliberate work, errands, learning, maintenance, or specific planned downtime.",
      "Lenient mode: if a leisure request is concrete and time-boxed, it may pass even when it is not productive.",
    ];
  }

  return [
    ...shared,
    "Balanced mode: approve deliberate work, errands, learning, maintenance, debugging, or specific planned downtime.",
    "Balanced mode: ask one follow-up for vague leisure or ambiguous requests instead of approving immediately.",
  ];
};

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
  const reviewStrictness = normalizeReviewStrictness(context.reviewStrictness);
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
          decision: {
            type: "string",
            enum: ["PASS", "PASS_WITH_LIMIT", "FAIL", "ASK_FOLLOWUP"],
          },
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
                task: "Review one temporary access request.",
                constraints: [
                  "Use exactly one decision: PASS, PASS_WITH_LIMIT, FAIL, ASK_FOLLOWUP.",
                  "Ask at most one follow-up in total; if followUpCount is 1, return a terminal decision.",
                  "Do not exceed the requested minutes unless reducing it.",
                  "Prefer URL scope when purpose asks for one specific page and requestedUrl matches blocked domain.",
                  ...buildReviewStrictnessInstructions(reviewStrictness),
                ],
                request: {
                  blockedDomain: context.blockedDomain,
                  requestedUrl: context.requestedUrl,
                  requestedPurpose: context.requestedPurpose,
                  requestedMinutes: context.requestedMinutes,
                  reviewStrictness,
                  followUpAnswer: context.followUpAnswer ?? null,
                  followUpCount: context.followUpCount,
                  currentTimeIso: context.currentTimeIso,
                  dayOfWeek: context.dayOfWeek,
                  stats: buildStatsSnippet(context.stats),
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
