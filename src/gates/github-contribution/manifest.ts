import { BlockPageActionCapability } from "../../core/access-contracts.js";

export const githubContributionGateAction: BlockPageActionCapability = {
  id: "github-contribution-request-access",
  type: "request-access",
  messageType: "request-github-contribution-access",
  visibleByDefault: false,
  description: "Check today's public GitHub contribution activity before access.",
  label: "GitHub contribution",
  settingsLabel: "GitHub contribution check",
  buttonId: "github-contribution-request-access-gate-btn",
  formTitle: "GitHub contribution check",
  formPlaceholder: "Enter your GitHub username",
  submitLabel: "Check GitHub and request access",
  waitingLabel: "Checking GitHub...",
};
