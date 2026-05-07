import { BlockPageActionCapability } from "../../core/access-contracts.js";
import { IF_THEN_INTENTION_TEMPLATE } from "./gate.js";

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
  formPlaceholder: "Fill in each line, then commit to the plan.",
  formInitialValue: IF_THEN_INTENTION_TEMPLATE,
  submitLabel: "Commit and request access",
};
