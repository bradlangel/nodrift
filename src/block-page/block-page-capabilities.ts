import { BlockPageActionCapability, OptionalIntegration } from "../core/access-contracts.js";
import {
  GATE_BLOCK_PAGE_ACTION_CAPABILITIES,
  GATE_OPTIONAL_INTEGRATIONS,
} from "../gates/registry.js";

const PEEK_CHATGPT_ACTION_CAPABILITY: BlockPageActionCapability = {
  id: "peek-chatgpt",
  type: "peek-chatgpt",
  messageType: "peek-with-chatgpt",
  visibleByDefault: false,
  description: "Open ChatGPT with a generated peek prompt and snapshot.",
  label: "Peek with ChatGPT",
  buttonId: "peek-chatgpt-btn",
  className: "secondary",
  title:
    "Opens ChatGPT with your prompt and a quick page snapshot so you can review and send it yourself",
};

export const BLOCK_PAGE_ACTION_CAPABILITIES: BlockPageActionCapability[] = [
  ...GATE_BLOCK_PAGE_ACTION_CAPABILITIES,
  PEEK_CHATGPT_ACTION_CAPABILITY,
];

export const OPTIONAL_INTEGRATIONS: OptionalIntegration[] = [
  ...GATE_OPTIONAL_INTEGRATIONS,
  {
    id: "chatgpt-peek",
    actionId: "peek-chatgpt",
    messageType: "peek-with-chatgpt",
    enabledByDefault: false,
  },
];
