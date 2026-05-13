import {
  getLlmModelLabel,
  getLlmProviderSettings,
  type LlmProviderSettings,
} from "../llm-reviewed/provider-settings.js";
import { STORAGE_KEYS } from "../../storage-constants.js";
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
const AI_STUDY_QUIZ_CHALLENGE_TTL_MS = 10 * 60 * 1000;
type StoredAiStudyQuizChallenges = Record<string, AiStudyQuizChallenge>;

const createChallengeId = (): string =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const pruneAiStudyQuizChallenges = (now = Date.now()) => {
  aiStudyQuizChallenges.forEach((challenge, id) => {
    if (now - challenge.createdAt > AI_STUDY_QUIZ_CHALLENGE_TTL_MS) {
      aiStudyQuizChallenges.delete(id);
    }
  });
};

const isStoredAiStudyQuizChallenge = (
  value: unknown
): value is AiStudyQuizChallenge => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const maybe = value as AiStudyQuizChallenge;
  return (
    typeof maybe.id === "string" &&
    typeof maybe.topic === "string" &&
    typeof maybe.createdAt === "number" &&
    Number.isFinite(maybe.createdAt) &&
    Array.isArray(maybe.questions) &&
    maybe.questions.length >= 2 &&
    maybe.questions.every(
      (question) =>
        question &&
        typeof question.question === "string" &&
        Array.isArray(question.choices) &&
        Array.isArray(question.acceptableAnswers)
    )
  );
};

const getAiStudyQuizChallengeStorage = () =>
  chrome.storage?.session ?? chrome.storage.local;

const readStoredAiStudyQuizChallenges =
  (): Promise<StoredAiStudyQuizChallenges> =>
    new Promise((resolve) => {
      getAiStudyQuizChallengeStorage().get(
        { [STORAGE_KEYS.aiStudyQuizChallenges]: {} },
        (items: Record<string, unknown>) => {
          const stored = items[STORAGE_KEYS.aiStudyQuizChallenges];
          if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
            resolve({});
            return;
          }
          const entries = Object.entries(stored).filter(
            (entry): entry is [string, AiStudyQuizChallenge] =>
              isStoredAiStudyQuizChallenge(entry[1])
          );
          resolve(Object.fromEntries(entries));
        }
      );
    });

const writeStoredAiStudyQuizChallenges = (
  challenges: StoredAiStudyQuizChallenges
): Promise<void> =>
  new Promise((resolve) => {
    getAiStudyQuizChallengeStorage().set(
      { [STORAGE_KEYS.aiStudyQuizChallenges]: challenges },
      () => resolve()
    );
  });

const pruneStoredAiStudyQuizChallenges = async (now = Date.now()): Promise<void> => {
  const stored = await readStoredAiStudyQuizChallenges();
  const freshEntries = Object.entries(stored).filter(
    ([, challenge]) => now - challenge.createdAt <= AI_STUDY_QUIZ_CHALLENGE_TTL_MS
  );
  if (freshEntries.length !== Object.keys(stored).length) {
    await writeStoredAiStudyQuizChallenges(Object.fromEntries(freshEntries));
  }
};

const persistAiStudyQuizChallenge = async (
  challenge: AiStudyQuizChallenge
): Promise<void> => {
  aiStudyQuizChallenges.set(challenge.id, challenge);
  const stored = await readStoredAiStudyQuizChallenges();
  stored[challenge.id] = challenge;
  await writeStoredAiStudyQuizChallenges(stored);
};

const getAiStudyQuizChallenge = async (
  challengeId: string
): Promise<AiStudyQuizChallenge | null> => {
  pruneAiStudyQuizChallenges();
  const cached = aiStudyQuizChallenges.get(challengeId);
  if (cached) return cached;

  const stored = await readStoredAiStudyQuizChallenges();
  const challenge = stored[challengeId];
  if (!challenge) return null;

  if (Date.now() - challenge.createdAt > AI_STUDY_QUIZ_CHALLENGE_TTL_MS) {
    delete stored[challengeId];
    await writeStoredAiStudyQuizChallenges(stored);
    return null;
  }

  aiStudyQuizChallenges.set(challenge.id, challenge);
  return challenge;
};

const deleteAiStudyQuizChallenge = async (challengeId: string): Promise<void> => {
  aiStudyQuizChallenges.delete(challengeId);
  const stored = await readStoredAiStudyQuizChallenges();
  if (stored[challengeId]) {
    delete stored[challengeId];
    await writeStoredAiStudyQuizChallenges(stored);
  }
};

const formatAiStudyQuizChallenge = (
  challenge: AiStudyQuizChallenge,
  prefix = `Answer all ${challenge.questions.length} ${challenge.topic} questions:`
): string =>
  [
    prefix,
    ...challenge.questions.flatMap((item, index) => [
      `${index + 1}. ${item.question}`,
      ...item.choices.map(
        (choice, choiceIndex) => `   ${String.fromCharCode(65 + choiceIndex)}. ${choice}`
      ),
    ]),
  ].join("\n");

const requestChromeLocalQuiz = async (topic: string): Promise<unknown> => {
  const languageModel = (globalThis as any).LanguageModel;
  if (!languageModel?.availability || !languageModel?.create) {
    throw new Error("Chrome local AI is not available in this browser.");
  }

  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await languageModel.availability(options);
  if (availability === "unavailable") {
    throw new Error("Chrome local AI is unavailable on this device or Chrome profile.");
  }

  let session: any = null;
  try {
    session = await languageModel.create(options);
    const result = await session.prompt(buildAiStudyQuizPrompt(topic));
    if (typeof result !== "string" || !result.trim()) {
      throw new Error("Chrome local AI returned an empty quiz response.");
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
      max_output_tokens: 900,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You generate short multiple-choice study quiz JSON for a soft website blocker. Reply with valid JSON only.",
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
              questions: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    question: { type: "string" },
                    choices: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 4,
                      maxItems: 4,
                    },
                    answer: { type: "string" },
                    acceptableAnswers: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 2,
                      maxItems: 6,
                    },
                    explanation: { type: "string" },
                  },
                  required: [
                    "question",
                    "choices",
                    "answer",
                    "acceptableAnswers",
                    "explanation",
                  ],
                },
              },
            },
            required: ["questions"],
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
  await persistAiStudyQuizChallenge(challenge);
  return challenge;
};

const buildAiStudyQuizFollowUpResult = (
  challenge: AiStudyQuizChallenge,
  provider: LlmProviderSettings,
  modelLabel: string,
  minutes: number,
  prefix?: string
): RequestGateDecisionResult => {
  const message = formatAiStudyQuizChallenge(challenge, prefix);
  return {
    provider: provider.provider,
    model: modelLabel,
    challengeId: challenge.id,
    question: message,
    topic: challenge.topic,
    decision: {
      decision: "ASK_FOLLOWUP",
      scope: "none",
      minutes,
      host: null,
      url: null,
      ruleIds: [],
      message,
    },
  };
};

export const decideAiStudyQuizRequest = async (
  input: RequestGateInput
): Promise<RequestGateDecisionResult> => {
  pruneAiStudyQuizChallenges();
  await pruneStoredAiStudyQuizChallenges();
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
      return buildAiStudyQuizFollowUpResult(
        challenge,
        provider,
        modelLabel,
        input.defaultMinutes
      );
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

  const challenge = await getAiStudyQuizChallenge(input.challengeId);
  if (!challenge) {
    try {
      const nextChallenge = await generateAiStudyQuizChallenge(topic, provider);
      const result = buildAiStudyQuizFollowUpResult(
        nextChallenge,
        provider,
        modelLabel,
        input.defaultMinutes,
        `That quiz expired. Answer this new ${nextChallenge.questions.length}-question ${nextChallenge.topic} quiz:`
      );
      return result;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `The AI quiz expired, and a new quiz could not be generated: ${error.message}`
          : "The AI quiz expired, and a new quiz could not be generated.";
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
  const decision = aiStudyQuizGate.decide({
    rawUrl: input.rawUrl,
    requestedScope: "domain",
    requestedUrl: input.requestedUrl,
    blockedSites: input.blockedSites,
    defaultMinutes: input.defaultMinutes,
    topic: challenge.topic,
    answer: input.followUpAnswer,
    expectedAnswers: challenge.questions.map((question) => question.acceptableAnswers),
    requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
  });

  if (decision.decision === "ASK_FOLLOWUP" && challenge) {
    return {
      provider: provider.provider,
      model: modelLabel,
      challengeId: challenge.id,
      question: formatAiStudyQuizChallenge(
        challenge,
        `Not quite. Answer all ${challenge.questions.length} questions again:`
      ),
      topic: challenge.topic,
      decision,
    };
  }

  if (decision.decision !== "ASK_FOLLOWUP") {
    await deleteAiStudyQuizChallenge(input.challengeId);
  }

  return {
    provider: provider.provider,
    model: modelLabel,
    decision,
  };
};
