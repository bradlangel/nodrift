import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const aiStudyQuizGateOptions: GateOptionsDefinition = {
  cardDescription:
    "Uses the configured AI provider to generate a short multiple-choice quiz on a topic you choose.",
  detailsSummary: "Details",
  notes: [
    "Uses the same Chrome local or OpenAI provider settings as AI-reviewed request.",
    "The block page asks for a topic, then asks you to answer all generated questions.",
  ],
};
