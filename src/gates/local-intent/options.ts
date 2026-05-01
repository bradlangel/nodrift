import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const localIntentGateOptions: GateOptionsDefinition = {
  cardDescription: "A lightweight local review with no provider setup.",
  detailsSummary: "Details",
  notes: [
    "Uses the requested purpose, requested duration, current site, and local stats. No setup needed.",
  ],
};
