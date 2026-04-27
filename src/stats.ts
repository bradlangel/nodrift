export const MAX_RECENT_DECISIONS = 30;

export type AccessDecisionAction = "blocked" | "temporary-allow";

export type AccessDecision = {
  timestamp: number;
  site: string | null;
  action: AccessDecisionAction;
  scope: "domain" | "none";
  minutes: number | null;
};

export type DailyBlockerStats = {
  dayKey: string;
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowMinutesToday: number;
  recentDecisions: AccessDecision[];
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
  temporaryAllowMinutesToday: 0,
  recentDecisions: [],
});

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
  const scope = maybe.scope === "domain" || maybe.scope === "none" ? maybe.scope : null;
  if (!action || !scope) return null;

  const site = typeof maybe.site === "string" && maybe.site.trim() ? maybe.site.trim() : null;
  const minutes = typeof maybe.minutes === "number" && Number.isFinite(maybe.minutes)
    ? Math.max(Math.floor(maybe.minutes), 0)
    : null;

  return {
    timestamp: maybe.timestamp,
    action,
    scope,
    site,
    minutes,
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
    temporaryAllowMinutesToday:
      typeof maybe.temporaryAllowMinutesToday === "number" &&
      Number.isFinite(maybe.temporaryAllowMinutesToday)
        ? Math.max(Math.floor(maybe.temporaryAllowMinutesToday), 0)
        : 0,
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
  timestamp = Date.now()
): DailyBlockerStats => {
  const normalizedMinutes = Math.max(Math.floor(minutes), 0);
  return withRecentDecision(
    {
      ...stats,
      temporaryAllowsToday: stats.temporaryAllowsToday + 1,
      temporaryAllowMinutesToday: stats.temporaryAllowMinutesToday + normalizedMinutes,
    },
    {
      timestamp,
      site,
      action: "temporary-allow",
      scope: "domain",
      minutes: normalizedMinutes,
    }
  );
};
