export const DEFAULT_BLOCKED_SITES: string[] = [
  "reddit.com",
  "www.youtube.com",
  "news.ycombinator.com",
  "www.yahoo.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];

export const DEFAULT_BLOCK_PAGE_ALTERNATIVES: string[] = [
  "Read a book",
  "Go for a run",
];

export const DEFAULT_GRAYSCALE_ON_TEMP_ALLOW = true;
export const DEFAULT_TEMP_ALLOW_MINUTES = 10;

export const DEFAULT_ACCESS_GATE_ACTION_ID = "temporary-allow-domain";
export const LOCAL_INTENT_ACCESS_GATE_ACTION_ID = "local-intent-request-access";
export const LLM_REVIEWED_ACCESS_GATE_ACTION_ID = "llm-reviewed-request-access";
export const LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID = "agentic-request-access";

export const DEFAULT_SHOW_CHATGPT_PEEK = true;
export const DEFAULT_LLM_PROVIDER = "chrome-local";
export const DEFAULT_LLM_REVIEW_STRICTNESS = "3";
export const DEFAULT_LLM_LEISURE_ALLOWANCE = "3";
export const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
