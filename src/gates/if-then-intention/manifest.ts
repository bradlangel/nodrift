import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const ifThenIntentionGateAction: BlockPageActionCapability = {
  id: "if-then-intention-request-access",
  type: "request-access",
  messageType: "request-if-then-intention-access",
  visibleByDefault: false,
  description: "Make a purpose, stop condition, and drift plan before access.",
  label: "If/then intention",
  settingsLabel: "If/then intention",
  buttonId: "if-then-request-access-gate-btn",
  formTitle: "If/then intention",
  formPlaceholder:
    "I am using this site to...\nI will stop when...\nIf I notice myself drifting into...\nThen I will...",
  submitLabel: "Commit and request access",
};
