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
    id: "agentic-request-access",
    type: "request-access",
    messageType: "request-agentic-access",
    visibleByDefault: false,
    description: "Request focused access with purpose and a short duration.",
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
