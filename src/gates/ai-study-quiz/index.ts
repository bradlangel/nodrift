import {
  AiStudyQuizAccessRequestContext,
  GateModule,
} from "../../core/access-contracts.js";
import { aiStudyQuizGate } from "./gate.js";
import { aiStudyQuizGateAction } from "./manifest.js";
import { aiStudyQuizGateOptions } from "./options.js";

export { aiStudyQuizGate } from "./gate.js";
export { aiStudyQuizGateAction } from "./manifest.js";
export { aiStudyQuizGateOptions } from "./options.js";
export {
  areCorrectQuizAnswers,
  buildAiStudyQuizPrompt,
  isCorrectQuizAnswer,
  normalizeQuizAnswer,
  parseAiStudyQuizChallenge,
  parseQuizAnswerList,
} from "./quiz.js";
export type { AiStudyQuizChallenge, AiStudyQuizQuestion } from "./quiz.js";

export const aiStudyQuizGateModule: GateModule<AiStudyQuizAccessRequestContext> = {
  id: aiStudyQuizGate.id,
  gate: aiStudyQuizGate,
  action: aiStudyQuizGateAction,
  options: aiStudyQuizGateOptions,
};
