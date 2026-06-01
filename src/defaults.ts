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
  "Go to Career Tracker | http://localhost:5173",
];

export const DEFAULT_GRAYSCALE_ON_TEMP_ALLOW = true;
export const DEFAULT_TEMP_ALLOW_MINUTES = 1;

export const GRAYSCALE_ACCESS_EFFECT_ID = "grayscale";
export const STALE_MODE_ACCESS_EFFECT_ID = "stale-mode";
export const DEFAULT_ACCESS_EFFECT_IDS = [GRAYSCALE_ACCESS_EFFECT_ID];

export const DEFAULT_ACCESS_GATE_ACTION_ID = "temporary-allow-domain";
export const LLM_REVIEWED_ACCESS_GATE_ACTION_ID = "llm-reviewed-request-access";
export const BUILT_GATE_ACCESS_GATE_ACTION_ID = "built-gate-request-access";
export const LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID = "agentic-request-access";

export const DEFAULT_SHOW_CHATGPT_PEEK = true;
export const DEFAULT_LLM_PROVIDER = "chrome-local";
export const DEFAULT_LLM_REVIEW_STRICTNESS = "3";
export const DEFAULT_LLM_LEISURE_ALLOWANCE = "3";
export const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
export const DEFAULT_GITHUB_CONTRIBUTION_USERNAME = "";
export const DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES = 120;
export const DEFAULT_GITHUB_CONTRIBUTION_DAILY_THRESHOLD = 20;
export const DEFAULT_BUILT_GATE_SPEC_JSON = JSON.stringify(
  {
    name: "Generated focus gate",
    description: "Require a specific purpose, stop condition, and next action.",
    questions: [
      "I am using this site to:",
      "I will stop when:",
      "After this I will:",
    ],
    requiredAnswerMinChars: 3,
    denyKeywords: ["scroll", "bored", "kill time", "doomscroll", "procrastinate"],
    approveKeywords: [
      "work",
      "research",
      "learn",
      "study",
      "debug",
      "fix",
      "read",
      "specific",
      "article",
      "docs",
    ],
    urlScopeKeywords: ["this page", "exact page", "article", "thread", "docs"],
    maxMinutes: 20,
    successMessage: "Approved by your generated gate.",
    failureMessage: "Your generated gate needs a more specific, bounded plan.",
  },
  null,
  2
);
