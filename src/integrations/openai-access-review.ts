import { DailyStatsContext } from "../core/access-contracts.js";

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

export type LlmReviewLevel = 1 | 2 | 3 | 4 | 5;

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

export const normalizeReviewLevel = (value: unknown): LlmReviewLevel => {
  if (value === "lenient") return 2;
  if (value === "strict") return 4;
  if (value === "balanced") return 3;

  const numericValue = typeof value === "number" ? value : Number(value);
  if (numericValue === 1 || numericValue === 2 || numericValue === 3 || numericValue === 4 || numericValue === 5) {
    return numericValue;
  }

  return 3;
};

const buildReviewLevelInstructions = (
  strictnessLevel: LlmReviewLevel,
  leisureAllowanceLevel: LlmReviewLevel
): string[] => {
  const shared = [
    "Treat vague purposes such as just for fun, bored, scroll, browse, check stuff, or kill time as insufficient.",
    "A request should explain what the user will do, why they need this blocked site, and what will count as done.",
    "The message field must explain the concrete reason for your decision in one short sentence.",
    "If you approve, the message must say why the request was specific enough.",
    "If you deny or ask a follow-up, the message must say what detail is missing or what boundary was crossed.",
    `Purpose scrutiny level is ${strictnessLevel} of 5.`,
    `Leisure allowance level is ${leisureAllowanceLevel} of 5.`,
    "Purpose scrutiny 1 means light review; 3 means balanced review; 5 means require a clear, necessary, well-bounded purpose.",
    "Leisure allowance 1 means leisure is rarely approved; 3 means planned leisure can pass when specific and time-boxed; 5 means leisure can pass easily if still concrete and bounded.",
    "When the purpose is vague and followUpCount is 0, prefer ASK_FOLLOWUP unless purpose scrutiny is 4 or 5.",
    "When the purpose remains vague after one follow-up, return FAIL.",
  ];

  const instructions = [...shared];

  if (strictnessLevel >= 5) {
    instructions.push(
      "At purpose scrutiny 5, approve only urgent or necessary work, errands, maintenance, research, learning, or debugging."
    );
  } else if (strictnessLevel >= 4) {
    instructions.push(
      "At purpose scrutiny 4, return FAIL for casual, vague, novelty, or open-ended requests instead of asking a follow-up."
    );
  } else if (strictnessLevel <= 2) {
    instructions.push(
      "At purpose scrutiny 1-2, approve plausible concrete requests more readily, but never approve vague or open-ended access."
    );
  }

  if (leisureAllowanceLevel <= 1) {
    instructions.push(
      "At leisure allowance 1, return FAIL for entertainment, casual browsing, novelty, and open-ended downtime."
    );
  } else if (leisureAllowanceLevel === 2) {
    instructions.push(
      "At leisure allowance 2, approve leisure only when it is planned, specific, short, and has a clear stopping point."
    );
  } else if (leisureAllowanceLevel === 3) {
    instructions.push(
      "At leisure allowance 3, planned downtime may pass when it is specific, time-boxed, and not feed-seeking."
    );
  } else {
    instructions.push(
      "At leisure allowance 4-5, leisure does not need to be productive, but it still must be concrete and time-boxed."
    );
  }

  if (strictnessLevel >= 4 && leisureAllowanceLevel <= 2) {
    instructions.push(
      "When both purpose scrutiny is high and leisure allowance is low, deny casual requests rather than asking for more detail."
    );
  }

  return instructions;
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
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
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
                  ...buildReviewLevelInstructions(reviewStrictnessLevel, leisureAllowanceLevel),
                ],
                request: {
                  blockedDomain: context.blockedDomain,
                  requestedUrl: context.requestedUrl,
                  requestedPurpose: context.requestedPurpose,
                  requestedMinutes: context.requestedMinutes,
                  reviewStrictnessLevel,
                  leisureAllowanceLevel,
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
