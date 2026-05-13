import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const llmReviewedGateAction: BlockPageActionCapability = {
  id: "llm-reviewed-request-access",
  type: "request-access",
  messageType: "request-llm-reviewed-access",
  visibleByDefault: false,
  description: "Use your configured AI provider to review the access request.",
  label: "AI-reviewed request",
  settingsLabel: "AI-reviewed request",
  buttonId: "llm-request-access-gate-btn",
};
