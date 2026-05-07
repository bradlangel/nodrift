import {
  AccessGate,
  AccessGateDecision,
  LocalIntentAccessRequestContext,
} from "../../core/access-contracts.js";
import {
  clampRequestedMinutes,
  failDecision,
  normalizeGateText,
  pickRequestedUrl,
  resolveHostAndRules,
} from "../shared/access-request.js";

export const IF_THEN_INTENTION_TEMPLATE = [
  "I am using this site to: ",
  "I will stop when: ",
  "If I notice myself drifting into: ",
  "Then I will: ",
].join("\n");

type IfThenIntentionFields = {
  purpose: string;
  stopCondition: string;
  driftTrigger: string;
  response: string;
};

const cleanFieldValue = (value: string | null | undefined): string =>
  (value || "")
    .replace(/^[:\s._-]+/, "")
    .replace(/[_]{2,}/g, "")
    .replace(/[.]{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();

const findLineValue = (
  lines: string[],
  patterns: RegExp[],
  transform: (match: RegExpMatchArray) => string | undefined = (match) => match[1]
): string => {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const value = cleanFieldValue(transform(match));
        if (value) return value;
      }
    }
  }
  return "";
};

export const parseIfThenIntentionFields = (
  value: string | null | undefined
): IfThenIntentionFields => {
  const lines = (value || "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const purpose = findLineValue(lines, [
    /^i am using this site to\b(.*)$/i,
    /^i'm using this site to\b(.*)$/i,
    /^using this site to\b(.*)$/i,
  ]);
  const stopCondition = findLineValue(lines, [
    /^i will stop when\b(.*)$/i,
    /^i'll stop when\b(.*)$/i,
    /^stop when\b(.*)$/i,
    /^done when\b(.*)$/i,
  ]);
  const driftTrigger = findLineValue(
    lines,
    [
      /^if i notice myself drifting into\b(.*?)(?:,\s*then\b.*)?$/i,
      /^if i notice myself\b(.*?)(?:,\s*then\b.*)?$/i,
      /^if i\b(.*?)(?:,\s*then\b.*)?$/i,
      /^if\b(.*?)(?:,\s*then\b.*)?$/i,
    ],
    (match) => match[1]
  );
  const response = findLineValue(
    lines,
    [
      /\bthen i will\b(.*)$/i,
      /\bthen i'll\b(.*)$/i,
      /^then\b(.*)$/i,
    ],
    (match) => match[1]
  );

  return {
    purpose,
    stopCondition,
    driftTrigger,
    response,
  };
};

const hasFilledTemplate = (fields: IfThenIntentionFields): boolean =>
  Object.values(fields).every((value) => normalizeGateText(value).length >= 3);

export const ifThenIntentionGate: AccessGate<LocalIntentAccessRequestContext> = {
  id: "if-then-intention-access",
  decide: (context): AccessGateDecision => {
    const minutes = clampRequestedMinutes(
      Number(context.requestedMinutes),
      context.defaultMinutes
    );
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return failDecision(minutes, "I couldn't determine which blocked site to allow.");
    }

    const plan = context.requestedPurpose;
    if (!normalizeGateText(plan)) {
      return {
        decision: "ASK_FOLLOWUP",
        scope: "none",
        minutes,
        host,
        url: null,
        ruleIds,
        message: "Write a purpose, stop condition, and if/then drift plan.",
      };
    }

    const fields = parseIfThenIntentionFields(plan);
    if (!hasFilledTemplate(fields)) {
      return failDecision(
        minutes,
        "Fill in each template line: purpose, stop condition, drift trigger, and response.",
        host,
        ruleIds
      );
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: pickRequestedUrl(context),
      ruleIds,
      message: "Approved with your intention receipt in place.",
    };
  },
};
