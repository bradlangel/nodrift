import { BlockPageActionCapability, OptionalIntegration } from "./access-contracts.js";

export const BLOCK_PAGE_ACTION_CAPABILITIES: BlockPageActionCapability[] = [
  {
    id: "temporary-allow-domain",
    type: "temporary-allow",
    messageType: "temporarily-allow-tab",
    visibleByDefault: true,
    description: "Allow the blocked site for the configured duration.",
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
