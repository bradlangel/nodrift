import { DEFAULT_BUILT_GATE_SPEC_JSON } from "../../defaults.js";
import { STORAGE_KEYS } from "../../storage-constants.js";

export type BuiltGateSpec = {
  name: string;
  description: string;
  questions: string[];
  requiredAnswerMinChars: number;
  denyKeywords: string[];
  approveKeywords: string[];
  urlScopeKeywords: string[];
  maxMinutes: number;
  successMessage: string;
  failureMessage: string;
};

const DEFAULT_SPEC = JSON.parse(DEFAULT_BUILT_GATE_SPEC_JSON) as BuiltGateSpec;
const MAX_NAME_LENGTH = 48;
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_QUESTIONS = 6;
const MAX_KEYWORDS = 24;
const MAX_LINE_LENGTH = 110;

const cleanLine = (value: unknown, fallback = ""): string => {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE_LENGTH);
  return normalized || fallback;
};

const cleanList = (
  value: unknown,
  fallback: string[],
  limit = MAX_KEYWORDS
): string[] => {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = source
    .map((item) => cleanLine(item).toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
  return cleaned.length > 0 ? cleaned : fallback;
};

const cleanQuestions = (value: unknown, fallback: string[]): string[] => {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = source
    .map((item) => cleanLine(item))
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
  return cleaned.length > 0 ? cleaned : fallback;
};

export const normalizeBuiltGateSpec = (value: unknown): BuiltGateSpec => {
  const candidate = typeof value === "string" ? JSON.parse(value) : value;
  const spec = candidate && typeof candidate === "object" ? (candidate as any) : {};
  const questions = cleanQuestions(spec.questions, DEFAULT_SPEC.questions);
  const minChars = Math.floor(Number(spec.requiredAnswerMinChars));
  const maxMinutes = Math.floor(Number(spec.maxMinutes));

  return {
    name: cleanLine(spec.name, DEFAULT_SPEC.name).slice(0, MAX_NAME_LENGTH),
    description: cleanLine(spec.description, DEFAULT_SPEC.description).slice(
      0,
      MAX_DESCRIPTION_LENGTH
    ),
    questions,
    requiredAnswerMinChars: Number.isFinite(minChars)
      ? Math.min(Math.max(minChars, 3), 80)
      : DEFAULT_SPEC.requiredAnswerMinChars,
    denyKeywords: cleanList(spec.denyKeywords, DEFAULT_SPEC.denyKeywords),
    approveKeywords: cleanList(spec.approveKeywords, DEFAULT_SPEC.approveKeywords),
    urlScopeKeywords: cleanList(spec.urlScopeKeywords, DEFAULT_SPEC.urlScopeKeywords),
    maxMinutes: Number.isFinite(maxMinutes)
      ? Math.min(Math.max(maxMinutes, 5), 45)
      : DEFAULT_SPEC.maxMinutes,
    successMessage: cleanLine(spec.successMessage, DEFAULT_SPEC.successMessage),
    failureMessage: cleanLine(spec.failureMessage, DEFAULT_SPEC.failureMessage),
  };
};

export const normalizeBuiltGateSpecJson = (value: unknown): string =>
  JSON.stringify(normalizeBuiltGateSpec(value), null, 2);

export const getBuiltGateSpec = (): Promise<BuiltGateSpec> =>
  new Promise((resolve) => {
    chrome.storage.sync.get(
      { [STORAGE_KEYS.builtGateSpec]: DEFAULT_BUILT_GATE_SPEC_JSON },
      (syncData: Record<string, unknown>) => {
        try {
          resolve(normalizeBuiltGateSpec(syncData[STORAGE_KEYS.builtGateSpec]));
        } catch {
          resolve(DEFAULT_SPEC);
        }
      }
    );
  });
