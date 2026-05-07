import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const ifThenIntentionGateOptions: GateOptionsDefinition = {
  cardDescription:
    "A reflective gate that asks for a purpose, stop condition, and if/then drift plan.",
  detailsSummary: "Details",
  notes: [
    "No provider setup needed.",
    "Best for access that is legitimate but easy to let sprawl.",
  ],
};
