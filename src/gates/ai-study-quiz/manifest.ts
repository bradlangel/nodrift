import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const aiStudyQuizGateAction: BlockPageActionCapability = {
  id: "ai-study-quiz-request-access",
  type: "request-access",
  messageType: "request-ai-study-quiz-access",
  visibleByDefault: false,
  description: "Practice a chosen topic with an AI-generated multiple-choice quiz before access.",
  label: "AI study quiz",
  settingsLabel: "AI study quiz",
  buttonId: "ai-study-quiz-request-access-gate-btn",
  formTitle: "AI study quiz",
  formPlaceholder: "What topic should NoDrift quiz you on?",
  submitLabel: "Generate quiz",
  waitingLabel: "Generating quiz...",
};
