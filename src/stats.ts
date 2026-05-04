export const MAX_RECENT_DECISIONS = 30;
export const MAX_LOCAL_STATS_EVENTS = 500;

export type AccessDecisionAction =
  | "blocked"
  | "temporary-allow"
  | "request-denied"
  | "request-follow-up";
export type AccessDecisionSource = "one-click" | "local-intent" | "llm-reviewed";
export type AccessDecisionCategory =
  | "work"
  | "learning"
  | "errand"
  | "maintenance"
  | "planned-leisure"
  | "unplanned-leisure"
  | "unclear";

export type LocalStatsEventName =
  | "blocker.blocked"
  | "access.requested"
  | "access.approved"
  | "access.denied"
  | "access.followup_requested"
  | "access.used";

export type LocalStatsEventAttributes = {
  site?: string | null;
  url?: string | null;
  scope?: "domain" | "url" | "none" | null;
  source?: AccessDecisionSource | null;
  provider?: string | null;
  model?: string | null;
  category?: AccessDecisionCategory;
  requested_minutes?: number | null;
  granted_minutes?: number | null;
  used_seconds?: number | null;
};

export type LocalStatsEventBody = {
  purpose?: string | null;
  message?: string | null;
};

export type LocalStatsEvent = {
  id: string;
  timestamp: number;
  name: LocalStatsEventName;
  attributes: LocalStatsEventAttributes;
  body?: LocalStatsEventBody;
};

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
  provider?: string | null;
  model?: string | null;
  category?: AccessDecisionCategory;
};

export type DailyBlockerStats = {
  dayKey: string;
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
  siteStatsToday: Record<string, DailySiteStats>;
  recentDecisions: AccessDecision[];
  events: LocalStatsEvent[];
};

export type DailySiteStats = {
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
};

export type SiteStatsProjection = DailySiteStats & {
  site: string;
  accessPressure: number | null;
  lastTemporaryAccessAt: number | null;
};

export type CategoryStatsProjection = {
  accessRequestsToday: number;
  temporaryAllowsToday: number;
  requestDenialsToday: number;
  followUpsToday: number;
  grantedMinutesToday: number;
  requestedMinutesToday: number;
  temporaryAllowUsedSecondsToday: number;
};

export type GateUsageStatsProjection = {
  accessRequestsToday: number;
  temporaryAllowsToday: number;
  requestDenialsToday: number;
  followUpsToday: number;
  grantedMinutesToday: number;
  requestedMinutesToday: number;
  temporaryAllowUsedSecondsToday: number;
};

export type LastAccessProjection = {
  timestamp: number;
  site: string | null;
  category: AccessDecisionCategory;
  minutes: number | null;
  source?: AccessDecisionSource;
};

export type DailyStatsProjection = {
  dayKey: string;
  globalStatsToday: Pick<
    DailyBlockerStats,
    "blockedAttemptsToday" | "temporaryAllowsToday" | "temporaryAllowUsedSecondsToday"
  >;
  perSiteStatsToday: Record<string, SiteStatsProjection>;
  recentSiteDecisions: AccessDecision[];
  categorySummaryToday: Record<AccessDecisionCategory, CategoryStatsProjection>;
  gateUsageSummaryToday: Record<AccessDecisionSource, GateUsageStatsProjection>;
  lastAccessByCategory: Partial<Record<AccessDecisionCategory, LastAccessProjection>>;
  lastAccessBySite: Record<string, LastAccessProjection>;
};

const DECISION_CATEGORIES: AccessDecisionCategory[] = [
  "work",
  "learning",
  "errand",
  "maintenance",
  "planned-leisure",
  "unplanned-leisure",
  "unclear",
];

const ACCESS_DECISION_SOURCES: AccessDecisionSource[] = [
  "one-click",
  "local-intent",
  "llm-reviewed",
];

const EVENT_NAMES: LocalStatsEventName[] = [
  "blocker.blocked",
  "access.requested",
  "access.approved",
  "access.denied",
  "access.followup_requested",
  "access.used",
];

const padDayPart = (value: number): string => String(value).padStart(2, "0");

export const getLocalDayKey = (timestamp = Date.now()): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = padDayPart(date.getMonth() + 1);
  const day = padDayPart(date.getDate());
  return `${year}-${month}-${day}`;
};

const createStatsEventId = (timestamp: number): string =>
  `${timestamp}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyCategoryStats = (): CategoryStatsProjection => ({
  accessRequestsToday: 0,
  temporaryAllowsToday: 0,
  requestDenialsToday: 0,
  followUpsToday: 0,
  grantedMinutesToday: 0,
  requestedMinutesToday: 0,
  temporaryAllowUsedSecondsToday: 0,
});

const createEmptyGateUsageStats = (): GateUsageStatsProjection => ({
  accessRequestsToday: 0,
  temporaryAllowsToday: 0,
  requestDenialsToday: 0,
  followUpsToday: 0,
  grantedMinutesToday: 0,
  requestedMinutesToday: 0,
  temporaryAllowUsedSecondsToday: 0,
});

const createEmptyCategorySummary = (): Record<AccessDecisionCategory, CategoryStatsProjection> =>
  Object.fromEntries(
    DECISION_CATEGORIES.map((category) => [category, createEmptyCategoryStats()])
  ) as Record<AccessDecisionCategory, CategoryStatsProjection>;

const createEmptyGateUsageSummary = (): Record<AccessDecisionSource, GateUsageStatsProjection> =>
  Object.fromEntries(
    ACCESS_DECISION_SOURCES.map((source) => [source, createEmptyGateUsageStats()])
  ) as Record<AccessDecisionSource, GateUsageStatsProjection>;

export const createEmptyDailyStats = (dayKey: string): DailyBlockerStats => ({
  dayKey,
  blockedAttemptsToday: 0,
  temporaryAllowsToday: 0,
  temporaryAllowUsedSecondsToday: 0,
  siteStatsToday: {},
  recentDecisions: [],
  events: [],
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

const normalizePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(Math.floor(value), 0);
};

const normalizeDailySiteStats = (value: unknown): DailySiteStats | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<DailySiteStats>;
  return {
    blockedAttemptsToday: normalizePositiveInteger(maybe.blockedAttemptsToday) ?? 0,
    temporaryAllowsToday: normalizePositiveInteger(maybe.temporaryAllowsToday) ?? 0,
    temporaryAllowUsedSecondsToday:
      normalizePositiveInteger(maybe.temporaryAllowUsedSecondsToday) ?? 0,
  };
};

const sanitizeDecisionText = (value: unknown, maxLength = 220): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeDecisionCategory = (value: unknown): AccessDecisionCategory => {
  if (typeof value !== "string") return "unclear";
  return DECISION_CATEGORIES.includes(value as AccessDecisionCategory)
    ? (value as AccessDecisionCategory)
    : "unclear";
};

const normalizeSource = (value: unknown): AccessDecisionSource | null => {
  if (value === "one-click" || value === "local-intent" || value === "llm-reviewed") {
    return value;
  }
  return null;
};

const normalizeScope = (value: unknown): "domain" | "url" | "none" | null => {
  if (value === "domain" || value === "url" || value === "none") return value;
  return null;
};

const normalizeEvent = (value: unknown): LocalStatsEvent | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<LocalStatsEvent>;
  if (typeof maybe.timestamp !== "number" || !Number.isFinite(maybe.timestamp)) return null;
  if (!EVENT_NAMES.includes(maybe.name as LocalStatsEventName)) return null;

  const rawAttributes =
    maybe.attributes && typeof maybe.attributes === "object" && !Array.isArray(maybe.attributes)
      ? maybe.attributes
      : {};
  const attributes = rawAttributes as Partial<LocalStatsEventAttributes>;
  const rawBody =
    maybe.body && typeof maybe.body === "object" && !Array.isArray(maybe.body) ? maybe.body : {};
  const body = rawBody as Partial<LocalStatsEventBody>;
  const normalizedBody: LocalStatsEventBody = {
    purpose: sanitizeDecisionText(body.purpose),
    message: sanitizeDecisionText(body.message),
  };

  return {
    id:
      typeof maybe.id === "string" && maybe.id.trim()
        ? maybe.id.trim().slice(0, 120)
        : createStatsEventId(maybe.timestamp),
    timestamp: maybe.timestamp,
    name: maybe.name as LocalStatsEventName,
    attributes: {
      site: normalizeSiteKey(attributes.site),
      url: sanitizeDecisionText(attributes.url, 500),
      scope: normalizeScope(attributes.scope),
      source: normalizeSource(attributes.source),
      provider: sanitizeDecisionText(attributes.provider, 80),
      model: sanitizeDecisionText(attributes.model, 120),
      category: normalizeDecisionCategory(attributes.category),
      requested_minutes: normalizePositiveInteger(attributes.requested_minutes),
      granted_minutes: normalizePositiveInteger(attributes.granted_minutes),
      used_seconds: normalizePositiveInteger(attributes.used_seconds),
    },
    body:
      normalizedBody.purpose || normalizedBody.message
        ? normalizedBody
        : undefined,
  };
};

const normalizeEvents = (value: unknown): LocalStatsEvent[] =>
  Array.isArray(value)
    ? value
        .map((event) => normalizeEvent(event))
        .filter((event): event is LocalStatsEvent => event !== null)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-MAX_LOCAL_STATS_EVENTS)
    : [];

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

const normalizeRecentDecision = (value: unknown): AccessDecision | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<AccessDecision>;
  if (typeof maybe.timestamp !== "number" || !Number.isFinite(maybe.timestamp)) return null;
  const action =
    maybe.action === "blocked" ||
    maybe.action === "temporary-allow" ||
    maybe.action === "request-denied" ||
    maybe.action === "request-follow-up"
      ? maybe.action
      : null;
  const scope = normalizeScope(maybe.scope);
  if (!action || !scope) return null;

  const purpose = sanitizeDecisionText(maybe.purpose);
  const category = normalizeDecisionCategory(maybe.category);
  return {
    timestamp: maybe.timestamp,
    action,
    scope,
    site: normalizeSiteKey(maybe.site),
    minutes: normalizePositiveInteger(maybe.minutes),
    ...(normalizeSource(maybe.source) ? { source: normalizeSource(maybe.source) ?? undefined } : {}),
    message: sanitizeDecisionText(maybe.message),
    purpose,
    url: sanitizeDecisionText(maybe.url, 500),
    provider: sanitizeDecisionText(maybe.provider, 80),
    model: sanitizeDecisionText(maybe.model, 120),
    category,
  };
};

const eventNameForDecisionAction = (action: AccessDecisionAction): LocalStatsEventName => {
  if (action === "blocked") return "blocker.blocked";
  if (action === "temporary-allow") return "access.approved";
  if (action === "request-follow-up") return "access.followup_requested";
  return "access.denied";
};

const decisionActionForEventName = (name: LocalStatsEventName): AccessDecisionAction | null => {
  if (name === "blocker.blocked") return "blocked";
  if (name === "access.approved") return "temporary-allow";
  if (name === "access.denied") return "request-denied";
  if (name === "access.followup_requested") return "request-follow-up";
  return null;
};

const decisionToEvent = (decision: AccessDecision, idPrefix = "decision"): LocalStatsEvent => ({
  id: `${idPrefix}-${decision.timestamp}-${decision.action}-${decision.site ?? "unknown"}`,
  timestamp: decision.timestamp,
  name: eventNameForDecisionAction(decision.action),
  attributes: {
    site: normalizeSiteKey(decision.site),
    url: sanitizeDecisionText(decision.url, 500),
    scope: decision.scope,
    source: normalizeSource(decision.source),
    provider: sanitizeDecisionText(decision.provider, 80),
    model: sanitizeDecisionText(decision.model, 120),
    category: normalizeDecisionCategory(decision.category),
    granted_minutes:
      decision.action === "temporary-allow" ? normalizePositiveInteger(decision.minutes) : null,
  },
  body:
    decision.purpose || decision.message
      ? {
          purpose: sanitizeDecisionText(decision.purpose),
          message: sanitizeDecisionText(decision.message),
        }
      : undefined,
});

const createEvent = (
  name: LocalStatsEventName,
  timestamp: number,
  attributes: LocalStatsEventAttributes = {},
  body: LocalStatsEventBody = {}
): LocalStatsEvent =>
  normalizeEvent({
    id: createStatsEventId(timestamp),
    timestamp,
    name,
    attributes,
    body,
  }) as LocalStatsEvent;

const eventToDecision = (event: LocalStatsEvent): AccessDecision | null => {
  const action = decisionActionForEventName(event.name);
  if (!action) return null;
  const scope = normalizeScope(event.attributes.scope) ?? (action === "blocked" ? "domain" : "none");
  const minutes =
    action === "temporary-allow" ? normalizePositiveInteger(event.attributes.granted_minutes) : null;

  return {
    timestamp: event.timestamp,
    site: normalizeSiteKey(event.attributes.site),
    action,
    scope,
    minutes,
    ...(event.attributes.source ? { source: event.attributes.source } : {}),
    message: sanitizeDecisionText(event.body?.message),
    purpose: sanitizeDecisionText(event.body?.purpose),
    url: sanitizeDecisionText(event.attributes.url, 500),
    provider: sanitizeDecisionText(event.attributes.provider, 80),
    model: sanitizeDecisionText(event.attributes.model, 120),
    category: normalizeDecisionCategory(event.attributes.category),
  };
};

const upsertSiteStats = (
  siteStatsToday: Record<string, DailySiteStats>,
  site: string | null | undefined,
  mutate: (siteStats: DailySiteStats) => DailySiteStats
): Record<string, DailySiteStats> => {
  const normalizedSite = normalizeSiteKey(site);
  if (!normalizedSite) return siteStatsToday;
  return {
    ...siteStatsToday,
    [normalizedSite]: mutate(siteStatsToday[normalizedSite] ?? createEmptyDailySiteStats()),
  };
};

const projectDailyStatsFromEvents = (
  dayKey: string,
  events: LocalStatsEvent[]
): DailyBlockerStats => {
  const siteStatsToday: Record<string, DailySiteStats> = {};
  let blockedAttemptsToday = 0;
  let temporaryAllowsToday = 0;
  let temporaryAllowUsedSecondsToday = 0;

  events.forEach((event) => {
    const site = normalizeSiteKey(event.attributes.site);
    if (event.name === "blocker.blocked") {
      blockedAttemptsToday += 1;
      Object.assign(
        siteStatsToday,
        upsertSiteStats(siteStatsToday, site, (stats) => ({
          ...stats,
          blockedAttemptsToday: stats.blockedAttemptsToday + 1,
        }))
      );
    }
    if (event.name === "access.approved") {
      temporaryAllowsToday += 1;
      Object.assign(
        siteStatsToday,
        upsertSiteStats(siteStatsToday, site, (stats) => ({
          ...stats,
          temporaryAllowsToday: stats.temporaryAllowsToday + 1,
        }))
      );
    }
    if (event.name === "access.used") {
      const usedSeconds = normalizePositiveInteger(event.attributes.used_seconds) ?? 0;
      temporaryAllowUsedSecondsToday += usedSeconds;
      Object.assign(
        siteStatsToday,
        upsertSiteStats(siteStatsToday, site, (stats) => ({
          ...stats,
          temporaryAllowUsedSecondsToday:
            stats.temporaryAllowUsedSecondsToday + usedSeconds,
        }))
      );
    }
  });

  const recentDecisions = events
    .map((event) => eventToDecision(event))
    .filter((decision): decision is AccessDecision => decision !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_DECISIONS);

  return {
    dayKey,
    blockedAttemptsToday,
    temporaryAllowsToday,
    temporaryAllowUsedSecondsToday,
    siteStatsToday,
    recentDecisions,
    events: events.slice(-MAX_LOCAL_STATS_EVENTS),
  };
};

const synthesizeLegacyEvents = (
  raw: Partial<DailyBlockerStats>,
  dayKey: string
): LocalStatsEvent[] => {
  const events: LocalStatsEvent[] = [];
  const decisions = Array.isArray(raw.recentDecisions)
    ? raw.recentDecisions
        .map((decision) => normalizeRecentDecision(decision))
        .filter((decision): decision is AccessDecision => decision !== null)
    : [];

  decisions.forEach((decision, index) => {
    events.push(decisionToEvent(decision, `legacy-decision-${index}`));
  });

  let projected = projectDailyStatsFromEvents(dayKey, events);
  const legacySiteStats = normalizeSiteStatsToday(raw.siteStatsToday);
  const legacyTimestamp = new Date(`${dayKey}T00:00:00`).getTime();
  let syntheticIndex = 0;

  Object.entries(legacySiteStats).forEach(([site, siteStats]) => {
    const projectedSite = projected.siteStatsToday[site] ?? createEmptyDailySiteStats();
    for (let i = projectedSite.blockedAttemptsToday; i < siteStats.blockedAttemptsToday; i += 1) {
      events.push(createEvent("blocker.blocked", legacyTimestamp + syntheticIndex, { site, scope: "domain" }));
      syntheticIndex += 1;
    }
    for (let i = projectedSite.temporaryAllowsToday; i < siteStats.temporaryAllowsToday; i += 1) {
      events.push(createEvent("access.approved", legacyTimestamp + syntheticIndex, { site, scope: "domain", category: "unclear" }));
      syntheticIndex += 1;
    }
    if (siteStats.temporaryAllowUsedSecondsToday > projectedSite.temporaryAllowUsedSecondsToday) {
      events.push(
        createEvent("access.used", legacyTimestamp + syntheticIndex, {
          site,
          used_seconds:
            siteStats.temporaryAllowUsedSecondsToday -
            projectedSite.temporaryAllowUsedSecondsToday,
        })
      );
      syntheticIndex += 1;
    }
  });

  projected = projectDailyStatsFromEvents(dayKey, events);
  const legacyBlocked = normalizePositiveInteger(raw.blockedAttemptsToday) ?? 0;
  const legacyAllows = normalizePositiveInteger(raw.temporaryAllowsToday) ?? 0;
  const legacyUsed = normalizePositiveInteger(raw.temporaryAllowUsedSecondsToday) ?? 0;

  for (let i = projected.blockedAttemptsToday; i < legacyBlocked; i += 1) {
    events.push(createEvent("blocker.blocked", legacyTimestamp + syntheticIndex, { scope: "domain" }));
    syntheticIndex += 1;
  }
  for (let i = projected.temporaryAllowsToday; i < legacyAllows; i += 1) {
    events.push(createEvent("access.approved", legacyTimestamp + syntheticIndex, { scope: "domain", category: "unclear" }));
    syntheticIndex += 1;
  }
  if (legacyUsed > projected.temporaryAllowUsedSecondsToday) {
    events.push(
      createEvent("access.used", legacyTimestamp + syntheticIndex, {
        used_seconds: legacyUsed - projected.temporaryAllowUsedSecondsToday,
      })
    );
  }

  return events.sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_LOCAL_STATS_EVENTS);
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

  const events = normalizeEvents(maybe.events);
  if (events.length > 0) {
    return projectDailyStatsFromEvents(expectedDayKey, events);
  }

  return projectDailyStatsFromEvents(expectedDayKey, synthesizeLegacyEvents(maybe, expectedDayKey));
};

const withEvent = (stats: DailyBlockerStats, event: LocalStatsEvent): DailyBlockerStats =>
  projectDailyStatsFromEvents(stats.dayKey, [...stats.events, event]);

export const withRecentDecision = (
  stats: DailyBlockerStats,
  decision: AccessDecision
): DailyBlockerStats => withEvent(stats, decisionToEvent(decision));

export const withBlockedAttempt = (
  stats: DailyBlockerStats,
  site: string | null,
  timestamp = Date.now()
): DailyBlockerStats =>
  withEvent(
    stats,
    createEvent("blocker.blocked", timestamp, {
      site,
      scope: "domain",
      category: "unclear",
    })
  );

export const withAccessRequested = (
  stats: DailyBlockerStats,
  site: string | null,
  requestedMinutes: number,
  timestamp = Date.now(),
  details: Partial<Pick<AccessDecision, "scope" | "source" | "purpose" | "url" | "category">> = {}
): DailyBlockerStats => {
  const purpose = sanitizeDecisionText(details.purpose);
  return withEvent(
    stats,
    createEvent(
      "access.requested",
      timestamp,
      {
        site,
        url: details.url,
        scope: normalizeScope(details.scope) ?? "domain",
        source: normalizeSource(details.source),
        requested_minutes: normalizePositiveInteger(requestedMinutes) ?? 0,
        category: normalizeDecisionCategory(details.category),
      },
      { purpose }
    )
  );
};

export const withTemporaryAllow = (
  stats: DailyBlockerStats,
  site: string | null,
  minutes: number,
  timestamp = Date.now(),
  details: Partial<
    Pick<
      AccessDecision,
      "scope" | "source" | "message" | "purpose" | "url" | "provider" | "model" | "category"
    > & { requestedMinutes: number }
  > = {}
): DailyBlockerStats => {
  const normalizedMinutes = Math.max(Math.floor(minutes), 0);
  const purpose = sanitizeDecisionText(details.purpose);
  return withEvent(
    stats,
    createEvent(
      "access.approved",
      timestamp,
      {
        site,
        url: details.url,
        scope: normalizeScope(details.scope) ?? "domain",
        source: normalizeSource(details.source),
        provider: details.provider,
        model: details.model,
        category: normalizeDecisionCategory(details.category),
        requested_minutes: normalizePositiveInteger(details.requestedMinutes),
        granted_minutes: normalizedMinutes,
      },
      {
        message: sanitizeDecisionText(details.message),
        purpose,
      }
    )
  );
};

export const withRequestGateDecision = (
  stats: DailyBlockerStats,
  decision: Omit<AccessDecision, "timestamp">,
  timestamp = Date.now()
): DailyBlockerStats => {
  const purpose = sanitizeDecisionText(decision.purpose);
  return withEvent(
    stats,
    createEvent(
      eventNameForDecisionAction(decision.action),
      timestamp,
      {
        site: decision.site,
        url: decision.url,
        scope: decision.scope,
        source: normalizeSource(decision.source),
        provider: decision.provider,
        model: decision.model,
        category: normalizeDecisionCategory(decision.category),
        granted_minutes:
          decision.action === "temporary-allow" ? normalizePositiveInteger(decision.minutes) : null,
      },
      {
        message: sanitizeDecisionText(decision.message),
        purpose,
      }
    )
  );
};

export const withTemporaryAllowUsedSeconds = (
  stats: DailyBlockerStats,
  seconds: number,
  site: string | null = null,
  timestamp = Date.now()
): DailyBlockerStats =>
  withEvent(
    stats,
    createEvent("access.used", timestamp, {
      site,
      used_seconds: Math.max(Math.floor(seconds), 0),
    })
  );

export const buildDailyStatsProjection = (
  stats: DailyBlockerStats,
  currentSite: string | null = null
): DailyStatsProjection => {
  const categorySummaryToday = createEmptyCategorySummary();
  const gateUsageSummaryToday = createEmptyGateUsageSummary();
  const perSiteStatsToday: Record<string, SiteStatsProjection> = Object.fromEntries(
    Object.entries(stats.siteStatsToday).map(([site, siteStats]) => [
      site,
      {
        site,
        ...siteStats,
        accessPressure:
          siteStats.blockedAttemptsToday > 0
            ? siteStats.temporaryAllowsToday / siteStats.blockedAttemptsToday
            : null,
        lastTemporaryAccessAt: null,
      },
    ])
  );
  const lastAccessByCategory: Partial<Record<AccessDecisionCategory, LastAccessProjection>> = {};
  const lastAccessBySite: Record<string, LastAccessProjection> = {};

  stats.events.forEach((event) => {
    const site = normalizeSiteKey(event.attributes.site);
    const eventCategory = normalizeDecisionCategory(event.attributes.category);
    const eventSource = normalizeSource(event.attributes.source);
    const source =
      event.name === "access.used" && !eventSource && site
        ? lastAccessBySite[site]?.source ?? null
        : eventSource;
    const category =
      event.name === "access.used" && eventCategory === "unclear" && site
        ? lastAccessBySite[site]?.category ?? eventCategory
        : eventCategory;
    const categoryStats = categorySummaryToday[category];
    const gateUsageStats = source ? gateUsageSummaryToday[source] : null;
    if (event.name === "access.requested") {
      categoryStats.accessRequestsToday += 1;
      categoryStats.requestedMinutesToday +=
        normalizePositiveInteger(event.attributes.requested_minutes) ?? 0;
      if (gateUsageStats) {
        gateUsageStats.accessRequestsToday += 1;
        gateUsageStats.requestedMinutesToday +=
          normalizePositiveInteger(event.attributes.requested_minutes) ?? 0;
      }
    }
    if (event.name === "access.approved") {
      const grantedMinutes = normalizePositiveInteger(event.attributes.granted_minutes) ?? 0;
      categoryStats.temporaryAllowsToday += 1;
      categoryStats.grantedMinutesToday += grantedMinutes;
      if (gateUsageStats) {
        gateUsageStats.temporaryAllowsToday += 1;
        gateUsageStats.grantedMinutesToday += grantedMinutes;
      }
      const access: LastAccessProjection = {
        timestamp: event.timestamp,
        site,
        category,
        minutes: grantedMinutes,
        ...(event.attributes.source ? { source: event.attributes.source } : {}),
      };
      if (!lastAccessByCategory[category] || lastAccessByCategory[category]!.timestamp < event.timestamp) {
        lastAccessByCategory[category] = access;
      }
      if (site) {
        lastAccessBySite[site] = access;
        if (!perSiteStatsToday[site]) {
          perSiteStatsToday[site] = {
            site,
            ...createEmptyDailySiteStats(),
            accessPressure: null,
            lastTemporaryAccessAt: null,
          };
        }
        perSiteStatsToday[site].lastTemporaryAccessAt = event.timestamp;
      }
    }
    if (event.name === "access.denied") {
      categoryStats.requestDenialsToday += 1;
      if (gateUsageStats) {
        gateUsageStats.requestDenialsToday += 1;
      }
    }
    if (event.name === "access.followup_requested") {
      categoryStats.followUpsToday += 1;
      if (gateUsageStats) {
        gateUsageStats.followUpsToday += 1;
      }
    }
    if (event.name === "access.used") {
      categoryStats.temporaryAllowUsedSecondsToday +=
        normalizePositiveInteger(event.attributes.used_seconds) ?? 0;
      if (gateUsageStats) {
        gateUsageStats.temporaryAllowUsedSecondsToday +=
          normalizePositiveInteger(event.attributes.used_seconds) ?? 0;
      }
    }
  });

  const normalizedCurrentSite = normalizeSiteKey(currentSite);
  const recentSiteDecisions = normalizedCurrentSite
    ? stats.recentDecisions.filter((decision) => normalizeSiteKey(decision.site) === normalizedCurrentSite)
    : stats.recentDecisions;

  return {
    dayKey: stats.dayKey,
    globalStatsToday: {
      blockedAttemptsToday: stats.blockedAttemptsToday,
      temporaryAllowsToday: stats.temporaryAllowsToday,
      temporaryAllowUsedSecondsToday: stats.temporaryAllowUsedSecondsToday,
    },
    perSiteStatsToday,
    recentSiteDecisions: recentSiteDecisions.slice(0, 10),
    categorySummaryToday,
    gateUsageSummaryToday,
    lastAccessByCategory,
    lastAccessBySite,
  };
};

export const buildAccessGateStatsContext = (
  stats: DailyBlockerStats,
  currentSite: string | null
) => {
  const projection = buildDailyStatsProjection(stats, currentSite);
  const normalizedCurrentSite = normalizeSiteKey(currentSite);
  const currentSiteStats = normalizedCurrentSite
    ? projection.perSiteStatsToday[normalizedCurrentSite] ?? {
        site: normalizedCurrentSite,
        ...createEmptyDailySiteStats(),
        accessPressure: null,
        lastTemporaryAccessAt: null,
      }
    : null;

  return {
    blockedAttemptsToday: stats.blockedAttemptsToday,
    temporaryAllowsToday: stats.temporaryAllowsToday,
    temporaryAllowUsedSecondsToday: stats.temporaryAllowUsedSecondsToday,
    globalStatsToday: projection.globalStatsToday,
    currentSiteStatsToday: currentSiteStats,
    categorySummaryToday: projection.categorySummaryToday,
    recentSiteDecisions: projection.recentSiteDecisions.slice(0, 5).map((entry) => ({
      timestamp: entry.timestamp,
      decision: entry.action,
      minutes: entry.minutes ?? undefined,
      scope: entry.scope,
      source: entry.source,
      category: entry.category ?? "unclear",
      message: entry.message ?? undefined,
    })),
    lastAccessByCategory: projection.lastAccessByCategory,
    lastAccessBySite: normalizedCurrentSite
      ? projection.lastAccessBySite[normalizedCurrentSite] ?? null
      : null,
  };
};
