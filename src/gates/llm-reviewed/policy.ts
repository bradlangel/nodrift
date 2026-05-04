export type LlmReviewLevel = 1 | 2 | 3 | 4 | 5;

export type AccessReviewPolicy = {
  task: string;
  constraints: string[];
  rubric: string[];
  examples: Array<{
    requestedPurpose: string;
    decision: "PASS" | "PASS_WITH_LIMIT" | "FAIL";
    scope: "domain" | "url" | "none";
    minutes: number;
    message: string;
  }>;
};

export const normalizeReviewLevel = (value: unknown): LlmReviewLevel => {
  if (value === "lenient") return 2;
  if (value === "strict") return 4;
  if (value === "balanced") return 3;

  const numericValue = typeof value === "number" ? value : Number(value);
  if (
    numericValue === 1 ||
    numericValue === 2 ||
    numericValue === 3 ||
    numericValue === 4 ||
    numericValue === 5
  ) {
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
    "If the request admits avoidance of work or another stated obligation, return FAIL unless it names a specific bounded recovery break.",
    "The message field must cite the decisive phrase or concrete evidence from the user's request.",
    "Never reuse names, phrases, or reasons from examples in the message field.",
    "If you approve, the message must say why the request was specific enough.",
    "If you deny, the message must say what detail is missing or what boundary was crossed.",
    `Purpose scrutiny level is ${strictnessLevel} of 5.`,
    `Leisure allowance level is ${leisureAllowanceLevel} of 5.`,
    "Purpose scrutiny 1 means light review; 3 means balanced review; 5 means require a clear, necessary, well-bounded purpose.",
    "Leisure allowance 1 means leisure is rarely approved; 3 means planned leisure can pass when specific and time-boxed; 5 means leisure can pass easily if still concrete and bounded.",
    "This is a single-input flow; return PASS, PASS_WITH_LIMIT, or FAIL only.",
    "When the purpose is vague, return FAIL with a short reason instead of asking a follow-up.",
  ];

  const instructions = [...shared];

  if (strictnessLevel >= 5) {
    instructions.push(
      "At purpose scrutiny 5, approve only urgent or necessary work, errands, maintenance, research, learning, or debugging."
    );
  } else if (strictnessLevel >= 4) {
    instructions.push("At purpose scrutiny 4, return FAIL for casual, vague, novelty, or open-ended requests.");
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

export const buildAccessReviewPolicy = (
  strictnessLevel: LlmReviewLevel,
  leisureAllowanceLevel: LlmReviewLevel
): AccessReviewPolicy => ({
  task: "Review one temporary access request.",
  constraints: [
    "Use exactly one decision: PASS, PASS_WITH_LIMIT, or FAIL.",
    "Do not ask follow-up questions; this flow has one input and needs a terminal decision.",
    "Do not exceed the requested minutes unless reducing it.",
    "If the message mentions an exact duration, it must match both the returned minutes value and the request duration. Otherwise omit the duration from the message.",
    "Prefer URL scope when purpose asks for one specific page and requestedUrl matches blocked domain.",
    "Use domain scope when the user needs to browse the site, open comment sections, follow internal links, or requestedUrl is the site homepage.",
    ...buildReviewLevelInstructions(strictnessLevel, leisureAllowanceLevel),
  ],
  rubric: [
    "specificity: Does the request name the actual task or page?",
    "necessity: Does the blocked site plausibly help with that task?",
    "boundedness: Does the request include a short duration or clear stopping point?",
    "obligation conflict: Does the user say they are avoiding work or another stated obligation?",
  ],
  examples: [
    {
      requestedPurpose: "Just for fun but I should be working",
      decision: "FAIL",
      scope: "none",
      minutes: 0,
      message:
        'Denied because "just for fun" is vague and conflicts with "I should be working."',
    },
    {
      requestedPurpose: "Need comment thread for a specific named debugging issue",
      decision: "PASS",
      scope: "domain",
      minutes: 10,
      message:
        'Approved because the request names a specific debugging issue and a bounded research target.',
    },
    {
      requestedPurpose: "Planned 10 minute break to read one saved article",
      decision: "PASS_WITH_LIMIT",
      scope: "url",
      minutes: 10,
      message:
        'Approved with a limit because "one saved article" is planned, specific, and time-boxed.',
    },
  ],
});
