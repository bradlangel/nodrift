import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const localIntentGateAction: BlockPageActionCapability = {
  id: "local-intent-request-access",
  type: "request-access",
  messageType: "request-local-intent-access",
  visibleByDefault: false,
  description: "Run a local intent check for focused access.",
  label: "Check intent",
  settingsLabel: "Local intent check (fallback/test)",
  buttonId: "request-access-gate-btn",
};
