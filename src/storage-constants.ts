export const STORAGE_KEYS = {
  blockedSites: "blockedSites",
  cachedBlockedSites: "cachedBlockedSites",
  tempAllowMinutes: "tempAllowMinutes",
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
