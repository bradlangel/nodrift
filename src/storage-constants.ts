export const STORAGE_KEYS = {
  blockedSites: "blockedSites",
  cachedBlockedSites: "cachedBlockedSites",
  tempAllowMinutes: "tempAllowMinutes",
  accessGateActionId: "accessGateActionId",
  showCareerTrackerRedirect: "showCareerTrackerRedirect",
  showChatGptPeek: "showChatGptPeek",
  blockPageAlternatives: "blockPageAlternatives",
  redirectUrl: "redirectUrl",
  redirectBtnText: "redirectBtnText",
  llmProvider: "llmProvider",
  llmReviewStrictness: "llmReviewStrictness",
  llmLeisureAllowance: "llmLeisureAllowance",
  openAiModel: "openAiModel",
  openAiApiKey: "openAiApiKey",
  grayscaleOnTemporaryAllow: "grayscaleOnTemporaryAllow",
  temporarilyAllowedGrayscaleHosts: "temporarilyAllowedGrayscaleHosts",
  temporarilyAllowedUrls: "temporarilyAllowedUrls",
  temporaryAllowUsageSession: "temporaryAllowUsageSession",
  lastPeekPrompt: "lastPeekPrompt",
  lastPeekSite: "lastPeekSite",
  lastPeekUrl: "lastPeekUrl",
  localDailyStats: "localDailyStats",
} as const;

export const ALARM_NAMES = {
  badgeRefresh: "refresh-temp-allow-badge",
} as const;
