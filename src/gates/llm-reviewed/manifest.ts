import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const llmReviewedGateAction: BlockPageActionCapability = {
  id: "llm-reviewed-request-access",
  type: "request-access",
  messageType: "request-llm-reviewed-access",
  visibleByDefault: false,
  description: "Use your configured LLM provider to review the access request.",
  label: "LLM-reviewed request",
  settingsLabel: "LLM-reviewed request",
  buttonId: "llm-request-access-gate-btn",
};
