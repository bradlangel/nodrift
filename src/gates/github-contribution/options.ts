import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const githubContributionGateOptions: GateOptionsDefinition = {
  cardDescription:
    "Checks a public GitHub profile for at least one contribution today before allowing access.",
  detailsSummary: "Details",
  notes: [
    "No GitHub login is required.",
    "The block page asks for a public GitHub username and checks the public contribution calendar.",
  ],
};
