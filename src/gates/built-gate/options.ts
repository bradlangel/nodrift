import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const builtGateOptions: GateOptionsDefinition = {
  cardDescription: "Describe the gate you want, generate a gate program, then run it dynamically.",
  detailsSummary: "Builder",
  notes: [
    "The AI creates structured gate rules, not executable JavaScript. NoDrift evaluates those rules locally.",
  ],
  textFields: [
    {
      type: "textarea",
      id: "built-gate-prompt",
      label: "Describe the gate",
      placeholder:
        "Example: Make me prove I have a specific research target, a stop condition, and one next action after browsing.",
      rows: 4,
    },
    {
      type: "textarea",
      id: "built-gate-spec",
      label: "Generated gate program",
      rows: 12,
      hint: "Editable JSON. Save settings after generating or editing.",
    },
  ],
  buttons: [
    {
      id: "generate-built-gate",
      label: "Generate gate",
    },
  ],
  statusId: "built-gate-status",
};
