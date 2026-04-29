export const MAX_RECENT_DECISIONS = 30;

export type AccessDecisionAction = "blocked" | "temporary-allow";
export type AccessDecisionSource = "one-click" | "local-intent" | "llm-reviewed";

export type AccessDecision = {
  timestamp: number;
  site: string | null;
  action: AccessDecisionAction;
  scope: "domain" | "url" | "none";
  minutes: number | null;
  source?: AccessDecisionSource;
  message?: string | null;
  purpose?: string | null;
  url?: string | null;
};

export type DailyBlockerStats = {
  dayKey: string;
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
  siteStatsToday: Record<string, DailySiteStats>;
  recentDecisions: AccessDecision[];
};

export type DailySiteStats = {
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
};

const padDayPart = (value: number): string => String(value).padStart(2, "0");

export const getLocalDayKey = (timestamp = Date.now()): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = padDayPart(date.getMonth() + 1);
  const day = padDayPart(date.getDate());
  return `${year}-${month}-${day}`;
};

export const createEmptyDailyStats = (dayKey: string): DailyBlockerStats => ({
  dayKey,
  blockedAttemptsToday: 0,
  temporaryAllowsToday: 0,
  temporaryAllowUsedSecondsToday: 0,
  siteStatsToday: {},
  recentDecisions: [],
});

const createEmptyDailySiteStats = (): DailySiteStats => ({
  blockedAttemptsToday: 0,
  temporaryAllowsToday: 0,
  temporaryAllowUsedSecondsToday: 0,
});

const normalizeSiteKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
};

const normalizeDailySiteStats = (value: unknown): DailySiteStats | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<DailySiteStats>;
  const blockedAttemptsToday =
    typeof maybe.blockedAttemptsToday === "number" && Number.isFinite(maybe.blockedAttemptsToday)
      ? Math.max(Math.floor(maybe.blockedAttemptsToday), 0)
      : 0;
  const temporaryAllowsToday =
    typeof maybe.temporaryAllowsToday === "number" && Number.isFinite(maybe.temporaryAllowsToday)
      ? Math.max(Math.floor(maybe.temporaryAllowsToday), 0)
      : 0;
  const temporaryAllowUsedSecondsToday =
    typeof maybe.temporaryAllowUsedSecondsToday === "number" &&
    Number.isFinite(maybe.temporaryAllowUsedSecondsToday)
      ? Math.max(Math.floor(maybe.temporaryAllowUsedSecondsToday), 0)
      : 0;
  return {
    blockedAttemptsToday,
    temporaryAllowsToday,
    temporaryAllowUsedSecondsToday,
  };
};

const sanitizeDecisionText = (value: unknown, maxLength = 220): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeSiteStatsToday = (value: unknown): Record<string, DailySiteStats> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalizedEntries: Array<[string, DailySiteStats]> = [];
  Object.entries(value as Record<string, unknown>).forEach(([rawSite, rawStats]) => {
    const site = normalizeSiteKey(rawSite);
    const stats = normalizeDailySiteStats(rawStats);
    if (!site || !stats) return;
    normalizedEntries.push([site, stats]);
  });
  return Object.fromEntries(normalizedEntries);
};

const upsertSiteStats = (
  siteStatsToday: Record<string, DailySiteStats>,
  site: string | null,
  mutate: (siteStats: DailySiteStats) => DailySiteStats
): Record<string, DailySiteStats> => {
  const normalizedSite = normalizeSiteKey(site);
  if (!normalizedSite) return siteStatsToday;
  return {
    ...siteStatsToday,
    [normalizedSite]: mutate(siteStatsToday[normalizedSite] ?? createEmptyDailySiteStats()),
  };
};

const normalizeRecentDecision = (value: unknown): AccessDecision | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<AccessDecision>;
  if (typeof maybe.timestamp !== "number" || !Number.isFinite(maybe.timestamp)) {
    return null;
  }
  const action =
    maybe.action === "blocked" || maybe.action === "temporary-allow"
      ? maybe.action
      : null;
  const scope =
    maybe.scope === "domain" || maybe.scope === "url" || maybe.scope === "none"
      ? maybe.scope
      : null;
  if (!action || !scope) return null;

  const site = typeof maybe.site === "string" && maybe.site.trim() ? maybe.site.trim() : null;
  const minutes = typeof maybe.minutes === "number" && Number.isFinite(maybe.minutes)
    ? Math.max(Math.floor(maybe.minutes), 0)
    : null;
  const source =
    maybe.source === "one-click" ||
    maybe.source === "local-intent" ||
    maybe.source === "llm-reviewed"
      ? maybe.source
      : undefined;

  return {
    timestamp: maybe.timestamp,
    action,
    scope,
    site,
    minutes,
    ...(source ? { source } : {}),
    message: sanitizeDecisionText(maybe.message),
    purpose: sanitizeDecisionText(maybe.purpose),
    url: sanitizeDecisionText(maybe.url, 500),
  };
};

export const normalizeDailyStats = (
  raw: unknown,
  now = Date.now()
): DailyBlockerStats => {
  const expectedDayKey = getLocalDayKey(now);

  if (!raw || typeof raw !== "object") {
    return createEmptyDailyStats(expectedDayKey);
  }

  const maybe = raw as Partial<DailyBlockerStats>;
  if (maybe.dayKey !== expectedDayKey) {
    return createEmptyDailyStats(expectedDayKey);
  }

  const decisions = Array.isArray(maybe.recentDecisions)
    ? maybe.recentDecisions
        .map((decision) => normalizeRecentDecision(decision))
        .filter((decision): decision is AccessDecision => decision !== null)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_RECENT_DECISIONS)
    : [];

  return {
    dayKey: expectedDayKey,
    blockedAttemptsToday:
      typeof maybe.blockedAttemptsToday === "number" && Number.isFinite(maybe.blockedAttemptsToday)
        ? Math.max(Math.floor(maybe.blockedAttemptsToday), 0)
        : 0,
    temporaryAllowsToday:
      typeof maybe.temporaryAllowsToday === "number" && Number.isFinite(maybe.temporaryAllowsToday)
        ? Math.max(Math.floor(maybe.temporaryAllowsToday), 0)
        : 0,
    temporaryAllowUsedSecondsToday:
      typeof maybe.temporaryAllowUsedSecondsToday === "number" &&
      Number.isFinite(maybe.temporaryAllowUsedSecondsToday)
        ? Math.max(Math.floor(maybe.temporaryAllowUsedSecondsToday), 0)
        : 0,
    siteStatsToday: normalizeSiteStatsToday(maybe.siteStatsToday),
    recentDecisions: decisions,
  };
};

export const withRecentDecision = (
  stats: DailyBlockerStats,
  decision: AccessDecision
): DailyBlockerStats => ({
  ...stats,
  recentDecisions: [decision, ...stats.recentDecisions].slice(0, MAX_RECENT_DECISIONS),
});

export const withBlockedAttempt = (
  stats: DailyBlockerStats,
  site: string | null,
  timestamp = Date.now()
): DailyBlockerStats =>
  withRecentDecision(
    {
      ...stats,
      blockedAttemptsToday: stats.blockedAttemptsToday + 1,
      siteStatsToday: upsertSiteStats(stats.siteStatsToday, site, (siteStats) => ({
        ...siteStats,
        blockedAttemptsToday: siteStats.blockedAttemptsToday + 1,
      })),
    },
    {
      timestamp,
      site,
      action: "blocked",
      scope: "domain",
      minutes: null,
    }
  );

export const withTemporaryAllow = (
  stats: DailyBlockerStats,
  site: string | null,
  minutes: number,
  timestamp = Date.now(),
  details: Partial<Pick<AccessDecision, "scope" | "source" | "message" | "purpose" | "url">> = {}
): DailyBlockerStats => {
  const normalizedMinutes = Math.max(Math.floor(minutes), 0);
  const scope =
    details.scope === "url" || details.scope === "domain" || details.scope === "none"
      ? details.scope
      : "domain";
  return withRecentDecision(
    {
      ...stats,
      temporaryAllowsToday: stats.temporaryAllowsToday + 1,
      siteStatsToday: upsertSiteStats(stats.siteStatsToday, site, (siteStats) => ({
        ...siteStats,
        temporaryAllowsToday: siteStats.temporaryAllowsToday + 1,
      })),
    },
    {
      timestamp,
      site,
      action: "temporary-allow",
      scope,
      minutes: normalizedMinutes,
      ...(details.source ? { source: details.source } : {}),
      message: sanitizeDecisionText(details.message),
      purpose: sanitizeDecisionText(details.purpose),
      url: sanitizeDecisionText(details.url, 500),
    }
  );
};

export const withTemporaryAllowUsedSeconds = (
  stats: DailyBlockerStats,
  seconds: number,
  site: string | null = null
): DailyBlockerStats => ({
  ...stats,
  temporaryAllowUsedSecondsToday:
    stats.temporaryAllowUsedSecondsToday + Math.max(Math.floor(seconds), 0),
  siteStatsToday: upsertSiteStats(stats.siteStatsToday, site, (siteStats) => ({
    ...siteStats,
    temporaryAllowUsedSecondsToday:
      siteStats.temporaryAllowUsedSecondsToday + Math.max(Math.floor(seconds), 0),
  })),
});
