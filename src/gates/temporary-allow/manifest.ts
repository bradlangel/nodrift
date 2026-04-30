import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const temporaryAllowGateAction: BlockPageActionCapability = {
  id: "temporary-allow-domain",
  type: "temporary-allow",
  messageType: "temporarily-allow-tab",
  visibleByDefault: true,
  description: "Allow the blocked site for the configured duration.",
  label: "Temporarily Allow",
  settingsLabel: "One-click temporary allow",
  buttonId: "temporarily-allow-btn",
  pendingLabel: "Temporarily allowing...",
  scope: "domain",
};
