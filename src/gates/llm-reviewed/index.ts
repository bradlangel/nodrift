import {
  GateModule,
  LlmReviewedAccessRequestContext,
} from "../../core/access-contracts.js";
import { llmReviewedAccessGate } from "./gate.js";
import { llmReviewedGateAction } from "./manifest.js";

export { llmReviewedAccessGate } from "./gate.js";
export { validateLlmReviewedDecision } from "./decision.js";
export { llmReviewedGateAction } from "./manifest.js";
export {
  buildAccessReviewPolicy,
  normalizeReviewLevel,
} from "./policy.js";
export {
  hasChromeLocalProviderConfig,
  requestChromeLocalAccessReview,
} from "./providers/chrome-local.js";
export {
  hasOpenAiProviderConfig,
  normalizeReviewLevel as normalizeOpenAiReviewLevel,
  requestOpenAiAccessReview,
} from "./providers/openai.js";

export const llmReviewedGateModule: GateModule<LlmReviewedAccessRequestContext> = {
  id: llmReviewedAccessGate.id,
  gate: llmReviewedAccessGate,
  action: llmReviewedGateAction,
};
