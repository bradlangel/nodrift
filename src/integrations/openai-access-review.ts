import { DailyStatsContext } from "../core/access-contracts.js";

export type OpenAiAccessReviewContext = {
  blockedDomain: string;
  requestedUrl: string | null;
  requestedPurpose: string;
  requestedMinutes: number;
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

const buildStatsSnippet = (stats?: DailyStatsContext) => ({
  blockedAttemptsToday: stats?.blockedAttemptsToday ?? 0,
  temporaryAllowsToday: stats?.temporaryAllowsToday ?? 0,
  temporaryAllowUsedSecondsToday: stats?.temporaryAllowUsedSecondsToday ?? 0,
  recentSiteDecisions: Array.isArray(stats?.recentSiteDecisions)
    ? stats?.recentSiteDecisions.slice(0, 5)
    : [],
});

export const requestOpenAiAccessReview = async (
  apiKey: string,
  model: string,
  context: OpenAiAccessReviewContext
): Promise<unknown> => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
                ],
                request: {
                  blockedDomain: context.blockedDomain,
                  requestedUrl: context.requestedUrl,
                  requestedPurpose: context.requestedPurpose,
                  requestedMinutes: context.requestedMinutes,
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
      text: {
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
              followUpQuestion: { type: "string" },
            },
            required: ["decision", "scope", "minutes", "message"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const maybeText = data?.output?.[0]?.content?.find?.((entry: any) => entry?.type === "output_text")?.text;
  if (typeof maybeText === "string" && maybeText.trim()) {
    return maybeText;
  }

  throw new Error("Provider response did not contain structured output text.");
};
