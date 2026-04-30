import {
  AccessReviewProgressStage,
  DailyStatsContext,
} from "../../../core/access-contracts.js";
import {
  buildAccessReviewPolicy,
  LlmReviewLevel,
  normalizeReviewLevel,
} from "../policy.js";

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

type ChromeLocalRequestAnalysis = {
  category: string;
  specificity: "specific" | "vague";
  boundedness: "bounded" | "unbounded";
  risk: "low" | "medium" | "high";
  requestEvidence: string;
  contextEvidence: string | null;
};

const LANGUAGE_MODEL_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const DECISION_CATEGORIES = [
  "work",
  "learning",
  "errand",
  "maintenance",
  "planned-leisure",
  "unplanned-leisure",
  "unclear",
];

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

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(extractJsonObjectText(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const sanitizeShortText = (value: unknown, maxLength = 160): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => (typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback);

export const normalizeChromeLocalRequestAnalysis = (
  rawAnalysis: unknown
): ChromeLocalRequestAnalysis | null => {
  const parsed =
    typeof rawAnalysis === "string" ? parseJsonObject(rawAnalysis) : rawAnalysis;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const analysis = parsed as Record<string, unknown>;
  const requestEvidence = sanitizeShortText(analysis.requestEvidence);
  if (!requestEvidence) return null;

  return {
    category: normalizeEnum(analysis.category, DECISION_CATEGORIES, "unclear"),
    specificity: normalizeEnum(analysis.specificity, ["specific", "vague"], "vague"),
    boundedness: normalizeEnum(analysis.boundedness, ["bounded", "unbounded"], "unbounded"),
    risk: normalizeEnum(analysis.risk, ["low", "medium", "high"], "medium"),
    requestEvidence,
    contextEvidence: sanitizeShortText(analysis.contextEvidence) ?? null,
  };
};

const formatBulletList = (items: string[]): string =>
  items.map((item, index) => `${index + 1}. ${item}`).join("\n");

const buildRequestPayload = (
  context: ChromeLocalAccessReviewContext,
  reviewStrictnessLevel: LlmReviewLevel,
  leisureAllowanceLevel: LlmReviewLevel
) => ({
  blockedDomain: context.blockedDomain,
  requestedUrl: context.requestedUrl,
  requestedPurpose: context.requestedPurpose,
  requestedMinutes: context.requestedMinutes,
  reviewStrictnessLevel,
  leisureAllowanceLevel,
  currentTimeIso: context.currentTimeIso,
  dayOfWeek: context.dayOfWeek,
  stats: buildStatsSnippet(context.stats),
});

export const buildChromeLocalAnalysisPrompt = (
  context: ChromeLocalAccessReviewContext
): string => {
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
  const policy = buildAccessReviewPolicy(reviewStrictnessLevel, leisureAllowanceLevel);

  return [
    "Analyze one temporary access request for a soft website blocker.",
    "Return exactly one valid JSON object and nothing else.",
    "Do not use markdown, code fences, comments, trailing commas, or unquoted keys.",
    "Use double quotes for every JSON key and string value. Escape any double quotes inside string values.",
    "",
    "Required JSON shape:",
    '{"category":"unclear","specificity":"vague","boundedness":"unbounded","risk":"medium","requestEvidence":"short phrase from the user request","contextEvidence":null}',
    "",
    "Allowed category values:",
    formatBulletList(DECISION_CATEGORIES),
    "",
    "Allowed specificity values: specific, vague.",
    "Allowed boundedness values: bounded, unbounded.",
    "Allowed risk values: low, medium, high.",
    "",
    "Constraints:",
    formatBulletList([
      "Use the local stats context when it materially changes risk or category.",
      "requestEvidence must be copied or closely paraphrased from requestedPurpose.",
      "contextEvidence must be null unless it cites a concrete fact from stats.",
      "Do not decide access in this step.",
      "Do not reuse names, phrases, or reasons from examples or instructions.",
      ...policy.rubric,
    ]),
    "",
    "Request:",
    JSON.stringify(
      buildRequestPayload(context, reviewStrictnessLevel, leisureAllowanceLevel),
      null,
      2
    ),
    "",
    "Return only the analysis JSON object now. The first character must be { and the last character must be }.",
  ].join("\n");
};

export const buildChromeLocalDecisionPrompt = (
  context: ChromeLocalAccessReviewContext,
  analysis: ChromeLocalRequestAnalysis
): string => {
  const reviewStrictnessLevel = normalizeReviewLevel(context.reviewStrictnessLevel);
  const leisureAllowanceLevel = normalizeReviewLevel(context.leisureAllowanceLevel);
  const policy = buildAccessReviewPolicy(reviewStrictnessLevel, leisureAllowanceLevel);

  return [
    "Decide one temporary access request for a soft website blocker.",
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
    formatBulletList([
      ...policy.constraints,
      "Use the prior analysis and stats context, but do not invent facts.",
      "The message must be one short sentence grounded in requestEvidence and, when relevant, contextEvidence.",
      "The message must not mention details absent from requestedPurpose, stats, or the prior analysis.",
    ]),
    "",
    "Rubric:",
    formatBulletList(policy.rubric),
    "",
    "Request:",
    JSON.stringify(
      buildRequestPayload(context, reviewStrictnessLevel, leisureAllowanceLevel),
      null,
      2
    ),
    "",
    "Prior analysis:",
    JSON.stringify(
      analysis,
      null,
      2
    ),
    "",
    "Return only the final JSON object now. The first character must be { and the last character must be }.",
  ].join("\n");
};

export const buildChromeLocalPrompt = (context: ChromeLocalAccessReviewContext): string =>
  buildChromeLocalDecisionPrompt(context, {
    category: "unclear",
    specificity: "vague",
    boundedness: "unbounded",
    risk: "medium",
    requestEvidence: context.requestedPurpose.slice(0, 160) || "the request",
    contextEvidence: null,
  });

export const hasChromeLocalProviderConfig = (config: { provider: string }): boolean =>
  config.provider === "chrome-local";

export const requestChromeLocalAccessReview = async (
  context: ChromeLocalAccessReviewContext,
  onProgress?: (stage: AccessReviewProgressStage) => void
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
    onProgress?.("analyzing");
    const analysisResult = await session.prompt(buildChromeLocalAnalysisPrompt(context));
    if (typeof analysisResult !== "string" || !analysisResult.trim()) {
      throw new Error("Chrome local LLM returned an empty analysis response.");
    }
    const analysis = normalizeChromeLocalRequestAnalysis(analysisResult);
    if (!analysis) {
      throw new Error("Chrome local LLM returned invalid analysis JSON.");
    }

    onProgress?.("reviewing");
    const decisionResult = await session.prompt(buildChromeLocalDecisionPrompt(context, analysis));
    if (typeof decisionResult !== "string" || !decisionResult.trim()) {
      throw new Error("Chrome local LLM returned an empty decision response.");
    }
    return extractJsonObjectText(decisionResult);
  } finally {
    session?.destroy?.();
  }
};
