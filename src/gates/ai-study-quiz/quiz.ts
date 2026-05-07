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

const sanitizeText = (value: unknown, maxLength = 280): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

export type AiStudyQuizChallenge = {
  id: string;
  topic: string;
  question: string;
  answer: string;
  acceptableAnswers: string[];
  explanation: string;
  createdAt: number;
};

export const normalizeQuizAnswer = (value: string | null | undefined): string =>
  (value || "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export const isCorrectQuizAnswer = (
  answer: string | null | undefined,
  acceptableAnswers: string[]
): boolean => {
  const normalizedAnswer = normalizeQuizAnswer(answer);
  if (!normalizedAnswer) return false;
  return acceptableAnswers.some((candidate) => {
    const normalizedCandidate = normalizeQuizAnswer(candidate);
    return normalizedCandidate === normalizedAnswer;
  });
};

export const buildAiStudyQuizPrompt = (topic: string): string =>
  [
    "Generate one short study quiz question for a website-blocking access gate.",
    "Return exactly one valid JSON object and nothing else.",
    "Do not use markdown, code fences, comments, trailing commas, or unquoted keys.",
    "Use double quotes for every JSON key and string value.",
    "",
    "Required JSON shape:",
    '{"question":"short question","answer":"short answer","acceptableAnswers":["answer","alternate"],"explanation":"one-sentence explanation"}',
    "",
    "Rules:",
    "1. The topic is chosen by the user.",
    "2. Ask a factual question with a short answer, not an opinion question.",
    "3. The answer must be at most six words.",
    "4. Include 1-4 acceptableAnswers, including the main answer.",
    "5. Avoid trick questions and ambiguous grading.",
    "",
    `Topic: ${topic}`,
  ].join("\n");

export const parseAiStudyQuizChallenge = (
  raw: unknown,
  topic: string,
  id: string,
  now = Date.now()
): AiStudyQuizChallenge | null => {
  const rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(extractJsonObjectText(rawText));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch {
    return null;
  }

  const question = sanitizeText(parsed.question);
  const answer = sanitizeText(parsed.answer, 120);
  const explanation = sanitizeText(parsed.explanation) || "Review the topic and try again.";
  const acceptableAnswers = Array.isArray(parsed.acceptableAnswers)
    ? parsed.acceptableAnswers
        .map((item) => sanitizeText(item, 120))
        .filter((item): item is string => !!item)
    : [];

  if (!question || !answer) return null;
  const uniqueAnswers = [...new Set([answer, ...acceptableAnswers])].slice(0, 4);
  return {
    id,
    topic,
    question,
    answer,
    acceptableAnswers: uniqueAnswers,
    explanation,
    createdAt: now,
  };
};
