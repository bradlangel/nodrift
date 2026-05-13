import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const builtGateAction: BlockPageActionCapability = {
  id: "built-gate-request-access",
  type: "request-access",
  messageType: "request-built-gate-access",
  visibleByDefault: false,
  description: "Run the dynamic gate generated in Settings.",
  label: "Generated gate",
  settingsLabel: "Gate builder",
  buttonId: "built-gate-request-access-btn",
  formTitle: "Generated gate",
  formPlaceholder: "Answer each prompt before requesting access.",
  submitLabel: "Request access",
};
