import {
  getLlmModelLabel,
  getLlmProviderSettings,
  type LlmProviderSettings,
} from "../llm-reviewed/provider-settings.js";
import {
  extractOpenAiOutputText,
  getOpenAiAccessReviewReasoningEffort,
  hasOpenAiProviderConfig,
} from "../llm-reviewed/providers/openai.js";
import { hasChromeLocalProviderConfig } from "../llm-reviewed/providers/chrome-local.js";
import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { aiStudyQuizGate } from "./gate.js";
import {
  AiStudyQuizChallenge,
  buildAiStudyQuizPrompt,
  parseAiStudyQuizChallenge,
} from "./quiz.js";

const aiStudyQuizChallenges = new Map<string, AiStudyQuizChallenge>();

const createChallengeId = (): string =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const pruneAiStudyQuizChallenges = (now = Date.now()) => {
  const ttlMs = 10 * 60 * 1000;
  aiStudyQuizChallenges.forEach((challenge, id) => {
    if (now - challenge.createdAt > ttlMs) {
      aiStudyQuizChallenges.delete(id);
    }
  });
};

const requestChromeLocalQuiz = async (topic: string): Promise<unknown> => {
  const languageModel = (globalThis as any).LanguageModel;
  if (!languageModel?.availability || !languageModel?.create) {
    throw new Error("Chrome local LLM is not available in this browser.");
  }

  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await languageModel.availability(options);
  if (availability === "unavailable") {
    throw new Error("Chrome local LLM is unavailable on this device or Chrome profile.");
  }

  let session: any = null;
  try {
    session = await languageModel.create(options);
    const result = await session.prompt(buildAiStudyQuizPrompt(topic));
    if (typeof result !== "string" || !result.trim()) {
      throw new Error("Chrome local LLM returned an empty quiz response.");
    }
    return result;
  } finally {
    session?.destroy?.();
  }
};

const requestOpenAiQuiz = async (
  apiKey: string,
  model: string,
  topic: string
): Promise<unknown> => {
  const reasoningEffort = getOpenAiAccessReviewReasoningEffort(model);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 350,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You generate short study quiz JSON for a soft website blocker. Reply with valid JSON only.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildAiStudyQuizPrompt(topic) }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "study_quiz_question",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              acceptableAnswers: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 4,
              },
              explanation: { type: "string" },
            },
            required: ["question", "answer", "acceptableAnswers", "explanation"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return extractOpenAiOutputText(data);
};

const generateAiStudyQuizChallenge = async (
  topic: string,
  provider: LlmProviderSettings
): Promise<AiStudyQuizChallenge> => {
  const id = createChallengeId();
  const raw = hasChromeLocalProviderConfig(provider)
    ? await requestChromeLocalQuiz(topic)
    : await requestOpenAiQuiz(provider.apiKey, provider.model, topic);
  const challenge = parseAiStudyQuizChallenge(raw, topic, id);
  if (!challenge) {
    throw new Error("The AI provider did not return a usable quiz question.");
  }
  aiStudyQuizChallenges.set(id, challenge);
  return challenge;
};

export const decideAiStudyQuizRequest = async (
  input: RequestGateInput
): Promise<RequestGateDecisionResult> => {
  pruneAiStudyQuizChallenges();
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
        message: "AI study quiz is selected, but provider settings are incomplete.",
      },
    };
  }

  const topic = typeof input.requestedText === "string" ? input.requestedText.trim() : "";
  if (!topic) {
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
        message: "Choose a study topic first.",
      },
    };
  }

  if (!input.challengeId || !input.followUpAnswer) {
    try {
      const challenge = await generateAiStudyQuizChallenge(topic, provider);
      return {
        provider: provider.provider,
        model: modelLabel,
        challengeId: challenge.id,
        question: `Answer this ${challenge.topic} question: ${challenge.question}`,
        topic: challenge.topic,
        decision: {
          decision: "ASK_FOLLOWUP",
          scope: "none",
          minutes: input.defaultMinutes,
          host: null,
          url: null,
          ruleIds: [],
          message: `Answer this ${challenge.topic} question: ${challenge.question}`,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `The AI quiz could not run: ${error.message}`
          : "The AI quiz is temporarily unavailable.";
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
  }

  const challenge = aiStudyQuizChallenges.get(input.challengeId);
  const decision = aiStudyQuizGate.decide({
    rawUrl: input.rawUrl,
    requestedScope: "domain",
    requestedUrl: input.requestedUrl,
    blockedSites: input.blockedSites,
    defaultMinutes: input.defaultMinutes,
    topic: challenge?.topic || topic,
    answer: input.followUpAnswer,
    expectedAnswers: challenge?.acceptableAnswers ?? [],
    requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
  });

  if (decision.decision === "ASK_FOLLOWUP" && challenge) {
    return {
      provider: provider.provider,
      model: modelLabel,
      challengeId: challenge.id,
      question: `Not quite. ${challenge.question}`,
      topic: challenge.topic,
      decision,
    };
  }

  if (decision.decision !== "ASK_FOLLOWUP") {
    aiStudyQuizChallenges.delete(input.challengeId);
  }

  return {
    provider: provider.provider,
    model: modelLabel,
    decision,
  };
};
