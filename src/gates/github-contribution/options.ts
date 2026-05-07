import type { GateOptionsDefinition } from "../../core/options-contracts.js";
import { DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES } from "../../defaults.js";

export const githubContributionGateOptions: GateOptionsDefinition = {
  cardDescription:
    "Checks a public GitHub profile for recent contribution events or a high daily contribution count before allowing access.",
  detailsSummary: "Details",
  notes: [
    "No GitHub login is required.",
    "The first block-page request can save a public GitHub username for future checks.",
    "The gate checks recent public events plus the public contribution calendar.",
  ],
  textFields: [
    {
      type: "text",
      id: "github-contribution-username",
      label: "GitHub username",
      placeholder: "octocat",
      autocomplete: "username",
      hint: "Stored in Chrome sync settings. Leave blank to enter it on the block page.",
    },
  ],
  rangeFields: [
    {
      type: "range",
      id: "github-contribution-recent-window-minutes",
      label: "Recent activity window",
      min: 15,
      max: 480,
      step: 15,
      value: String(DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES),
      labelId: "github-contribution-recent-window-minutes-label",
    },
  ],
};
