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
  questions: AiStudyQuizQuestion[];
  createdAt: number;
};

export type AiStudyQuizQuestion = {
  question: string;
  choices: string[];
  answer: string;
  acceptableAnswers: string[];
  explanation: string;
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

export const parseQuizAnswerList = (value: string | null | undefined): string[] => {
  const raw = (value || "").trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n|;/)
    .map((line) =>
      line
        .replace(/^\s*\d+[\).:-]?\s*/i, "")
        .replace(/^\s*([a-d])[\).:-]\s+(.+)$/i, "$2")
        .trim()
    )
    .filter(Boolean);

  if (lines.length <= 1 && raw.includes(",")) {
    return raw
      .split(",")
      .map((line) =>
        line
          .replace(/^\s*\d+[\).:-]?\s*/i, "")
          .replace(/^\s*([a-d])[\).:-]\s+(.+)$/i, "$2")
          .trim()
      )
      .filter(Boolean);
  }

  if (lines.length === 1) {
    const compactChoices = raw.replace(/\s+/g, "");
    if (/^[a-d]{2,}$/i.test(compactChoices)) {
      return compactChoices.split("");
    }

    const spacedChoices = raw.split(/\s+/).filter(Boolean);
    if (
      spacedChoices.length > 1 &&
      spacedChoices.every((choice) => /^[a-d]$/i.test(choice))
    ) {
      return spacedChoices;
    }
  }

  return lines;
};

export const areCorrectQuizAnswers = (
  answerText: string | null | undefined,
  expectedAnswers: string[][]
): boolean => {
  const answers = parseQuizAnswerList(answerText);
  if (answers.length < expectedAnswers.length) return false;
  return expectedAnswers.every((expected, index) =>
    isCorrectQuizAnswer(answers[index], expected)
  );
};

export const buildAiStudyQuizPrompt = (topic: string): string =>
  [
    "Generate a short multiple-choice study quiz for a website-blocking access gate.",
    "Return exactly one valid JSON object and nothing else.",
    "Do not use markdown, code fences, comments, trailing commas, or unquoted keys.",
    "Use double quotes for every JSON key and string value.",
    "",
    "Required JSON shape:",
    '{"questions":[{"question":"short question","choices":["choice A","choice B","choice C","choice D"],"answer":"choice A","acceptableAnswers":["A","choice A"],"explanation":"one-sentence explanation"}]}',
    "",
    "Rules:",
    "1. The topic is chosen by the user.",
    "2. Generate exactly three factual questions, not opinion questions.",
    "3. Each question must have exactly four choices.",
    "4. The answer must exactly match one choice.",
    "5. Include the correct letter and answer text in acceptableAnswers.",
    "6. Avoid trick questions and ambiguous grading.",
    "",
    `Topic: ${topic}`,
  ].join("\n");

const dedupeText = (values: string[], maxItems: number): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems);

const answerLetterForChoice = (choices: string[], answer: string): string | null => {
  const index = choices.findIndex(
    (choice) => normalizeQuizAnswer(choice) === normalizeQuizAnswer(answer)
  );
  return index >= 0 ? String.fromCharCode(65 + index) : null;
};

const parseAiStudyQuizQuestion = (raw: unknown): AiStudyQuizQuestion | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = raw as Record<string, unknown>;
  const question = sanitizeText(parsed.question);
  const answer = sanitizeText(parsed.answer, 120);
  const explanation = sanitizeText(parsed.explanation) || "Review the topic and try again.";
  const choices = Array.isArray(parsed.choices)
    ? dedupeText(
        parsed.choices
          .map((item) => sanitizeText(item, 120))
          .filter((item): item is string => !!item),
        4
      )
    : [];
  const acceptableAnswers = Array.isArray(parsed.acceptableAnswers)
    ? parsed.acceptableAnswers
        .map((item) => sanitizeText(item, 120))
        .filter((item): item is string => !!item)
    : [];

  if (!question || !answer || choices.length < 2) return null;
  const answerLetter = answerLetterForChoice(choices, answer);
  const uniqueAnswers = dedupeText(
    [answerLetter, answer, ...acceptableAnswers].filter((item): item is string => !!item),
    6
  );
  if (uniqueAnswers.length === 0) return null;

  return {
    question,
    choices,
    answer,
    acceptableAnswers: uniqueAnswers,
    explanation,
  };
};

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

  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .map((question) => parseAiStudyQuizQuestion(question))
        .filter((question): question is AiStudyQuizQuestion => !!question)
        .slice(0, 3)
    : [parseAiStudyQuizQuestion(parsed)].filter(
        (question): question is AiStudyQuizQuestion => !!question
      );

  if (questions.length < 2) return null;
  return {
    id,
    topic,
    questions,
    createdAt: now,
  };
};
