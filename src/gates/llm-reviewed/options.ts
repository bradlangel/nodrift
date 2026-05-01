import type { GateOptionsDefinition } from "../../core/options-contracts.js";

export const llmReviewedGateOptions: GateOptionsDefinition = {
  cardDescription: "Provider-reviewed access with local stats context.",
  detailsSummary: "Settings",
  notes: [
    "Privacy: request purpose, requested URL/domain, requested minutes, time/day, and small local stats context are sent to your provider.",
  ],
  providerGroup: {
    legend: "Default LLM provider",
    inputName: "llm-provider",
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        description: "Hosted review through your OpenAI API key.",
        fields: [
          {
            type: "text",
            id: "openai-model",
            label: "Model",
            placeholder: "gpt-5-nano",
          },
          {
            type: "password",
            id: "openai-api-key",
            label: "API key",
            placeholder: "sk-...",
            autocomplete: "off",
            hint: "Stored locally in this browser.",
          },
        ],
      },
      {
        id: "chrome-local",
        label: "Chrome local LLM",
        description: "On-device review when Chrome Prompt API is available.",
        hint: "No API key or hosted provider account required.",
      },
    ],
  },
  rangeFields: [
    {
      type: "range",
      id: "llm-review-strictness",
      label: "Purpose scrutiny",
      min: 1,
      max: 5,
      step: 1,
      value: "3",
      labelId: "llm-review-strictness-label",
    },
    {
      type: "range",
      id: "llm-leisure-allowance",
      label: "Leisure allowance",
      min: 1,
      max: 5,
      step: 1,
      value: "3",
      labelId: "llm-leisure-allowance-label",
    },
  ],
  statusId: "llm-config-status",
};
