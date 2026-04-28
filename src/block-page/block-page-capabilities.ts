import { BlockPageActionCapability, OptionalIntegration } from "../core/access-contracts.js";

export const BLOCK_PAGE_ACTION_CAPABILITIES: BlockPageActionCapability[] = [
  {
    id: "temporary-allow-domain",
    type: "temporary-allow",
    messageType: "temporarily-allow-tab",
    visibleByDefault: true,
    description: "Allow the blocked site for the configured duration.",
  },
  {
    id: "local-intent-request-access",
    type: "request-access",
    messageType: "request-local-intent-access",
    visibleByDefault: false,
    description: "Run a local intent check for focused access.",
  },
  {
    id: "llm-reviewed-request-access",
    type: "request-access",
    messageType: "request-llm-reviewed-access",
    visibleByDefault: false,
    description: "Use your configured LLM provider to review the access request.",
  },
  {
    id: "peek-chatgpt",
    type: "peek-chatgpt",
    messageType: "peek-with-chatgpt",
    visibleByDefault: false,
    description: "Open ChatGPT with a generated peek prompt and snapshot.",
  },
];

export const OPTIONAL_INTEGRATIONS: OptionalIntegration[] = [
  {
    id: "chatgpt-peek",
    actionId: "peek-chatgpt",
    messageType: "peek-with-chatgpt",
    enabledByDefault: false,
  },
];
