import assert from "node:assert/strict";

import {
  buildAccessGateStatsContext,
  buildDailyStatsProjection,
  createEmptyDailyStats,
  normalizeDailyStats,
  withAccessRequested,
  withBlockedAttempt,
  withRequestGateDecision,
  withTemporaryAllow,
  withTemporaryAllowUsedSeconds,
} from "../dist/stats.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

test("records local request-gate details for temporary allows", () => {
  const stats = withTemporaryAllow(
    createEmptyDailyStats("2026-04-28"),
    "old.reddit.com",
    15,
    new Date("2026-04-28T12:00:00Z").getTime(),
    {
      scope: "url",
      source: "llm-reviewed",
      message: "Approved for a specific page.",
      purpose: "Check one thread for release notes.",
      url: "https://old.reddit.com/r/example/comments/123",
      provider: "openai",
      model: "gpt-5-nano",
    }
  );

  const [decision] = stats.recentDecisions;
  assert.equal(decision.scope, "url");
  assert.equal(decision.source, "llm-reviewed");
  assert.equal(decision.message, "Approved for a specific page.");
  assert.equal(decision.purpose, "Check one thread for release notes.");
  assert.equal(decision.url, "https://old.reddit.com/r/example/comments/123");
  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "gpt-5-nano");
  assert.equal(decision.category, "unclear");
  assert.equal(stats.events[0].name, "access.approved");
  assert.equal(stats.events[0].attributes.granted_minutes, 15);
});

test("records OTel-shaped local stats events and derives daily counters", () => {
  const started = createEmptyDailyStats("2026-04-28");
  const requested = withAccessRequested(
    started,
    "news.ycombinator.com",
    20,
    new Date("2026-04-28T12:00:00Z").getTime(),
    {
      scope: "domain",
      source: "llm-reviewed",
      purpose: "Read release notes for work",
      url: "https://news.ycombinator.com/item?id=123",
    }
  );
  const blocked = withBlockedAttempt(
    requested,
    "news.ycombinator.com",
    new Date("2026-04-28T12:01:00Z").getTime()
  );
  const allowed = withTemporaryAllow(
    blocked,
    "news.ycombinator.com",
    10,
    new Date("2026-04-28T12:02:00Z").getTime(),
    {
      scope: "domain",
      source: "llm-reviewed",
      purpose: "Read release notes for work",
      requestedMinutes: 20,
    }
  );
  const stats = withTemporaryAllowUsedSeconds(
    allowed,
    125,
    "news.ycombinator.com",
    new Date("2026-04-28T12:05:00Z").getTime()
  );

  assert.deepEqual(
    stats.events.map((event) => event.name),
    ["access.requested", "blocker.blocked", "access.approved", "access.used"]
  );
  assert.equal(stats.blockedAttemptsToday, 1);
  assert.equal(stats.temporaryAllowsToday, 1);
  assert.equal(stats.temporaryAllowUsedSecondsToday, 125);
  assert.equal(stats.siteStatsToday["news.ycombinator.com"].blockedAttemptsToday, 1);
  assert.equal(stats.recentDecisions[0].action, "temporary-allow");
});

test("normalizes stored request-gate details", () => {
  const raw = {
    dayKey: "2026-04-28",
    blockedAttemptsToday: 0,
    temporaryAllowsToday: 1,
    temporaryAllowUsedSecondsToday: 0,
    siteStatsToday: {},
    recentDecisions: [
      {
        timestamp: new Date("2026-04-28T12:00:00Z").getTime(),
        site: "old.reddit.com",
        action: "temporary-allow",
        scope: "url",
        minutes: 15,
        source: "llm-reviewed",
        message: "  Approved   with extra whitespace. ",
        purpose: " just for fun ".repeat(30),
        provider: "chrome-local",
        model: "Chrome local LLM (Gemini Nano)",
      },
    ],
  };

  const stats = normalizeDailyStats(raw, new Date("2026-04-28T12:01:00Z").getTime());
  const [decision] = stats.recentDecisions;
  assert.equal(decision.scope, "url");
  assert.equal(decision.source, "llm-reviewed");
  assert.equal(decision.message, "Approved with extra whitespace.");
  assert.equal(decision.purpose.length, 220);
  assert.equal(decision.provider, "chrome-local");
  assert.equal(decision.model, "Chrome local LLM (Gemini Nano)");
  assert.equal(decision.category, "unclear");
});

test("normalizes an event-backed stats record as the source of truth", () => {
  const raw = {
    dayKey: "2026-04-28",
    blockedAttemptsToday: 99,
    temporaryAllowsToday: 99,
    temporaryAllowUsedSecondsToday: 99,
    siteStatsToday: {},
    recentDecisions: [],
    events: [
      {
        id: "event-1",
        timestamp: new Date("2026-04-28T12:00:00Z").getTime(),
        name: "blocker.blocked",
        attributes: {
          site: " News.YCombinator.com ",
          scope: "domain",
        },
      },
      {
        id: "event-2",
        timestamp: new Date("2026-04-28T12:01:00Z").getTime(),
        name: "access.approved",
        attributes: {
          site: "news.ycombinator.com",
          scope: "domain",
          granted_minutes: 15,
          category: "work",
        },
        body: {
          purpose: "Review a production incident thread",
        },
      },
    ],
  };

  const stats = normalizeDailyStats(raw, new Date("2026-04-28T12:02:00Z").getTime());
  assert.equal(stats.blockedAttemptsToday, 1);
  assert.equal(stats.temporaryAllowsToday, 1);
  assert.equal(stats.siteStatsToday["news.ycombinator.com"].temporaryAllowsToday, 1);
  assert.equal(stats.recentDecisions[0].action, "temporary-allow");
  assert.equal(stats.recentDecisions[0].category, "work");
});

test("derives old daily stats shape from legacy stored counters", () => {
  const raw = {
    dayKey: "2026-04-28",
    blockedAttemptsToday: 3,
    temporaryAllowsToday: 1,
    temporaryAllowUsedSecondsToday: 60,
    siteStatsToday: {
      "old.reddit.com": {
        blockedAttemptsToday: 2,
        temporaryAllowsToday: 1,
        temporaryAllowUsedSecondsToday: 60,
      },
    },
    recentDecisions: [
      {
        timestamp: new Date("2026-04-28T12:00:00Z").getTime(),
        site: "old.reddit.com",
        action: "blocked",
        scope: "domain",
        minutes: null,
      },
    ],
  };

  const stats = normalizeDailyStats(raw, new Date("2026-04-28T12:02:00Z").getTime());
  assert.equal(stats.blockedAttemptsToday, 3);
  assert.equal(stats.temporaryAllowsToday, 1);
  assert.equal(stats.temporaryAllowUsedSecondsToday, 60);
  assert.equal(stats.siteStatsToday["old.reddit.com"].blockedAttemptsToday, 2);
  assert.ok(stats.events.some((event) => event.name === "access.used"));
});

test("builds richer stats projections for gates and dashboard", () => {
  const stats = withTemporaryAllowUsedSeconds(
    withTemporaryAllow(
      withAccessRequested(
        withBlockedAttempt(
          createEmptyDailyStats("2026-04-28"),
          "old.reddit.com",
          new Date("2026-04-28T12:00:00Z").getTime()
        ),
        "old.reddit.com",
        15,
        new Date("2026-04-28T12:01:00Z").getTime(),
        {
          source: "llm-reviewed",
          purpose: "Check one thread for release notes.",
          url: "https://old.reddit.com/r/example/comments/123",
          category: "work",
        }
      ),
      "old.reddit.com",
      10,
      new Date("2026-04-28T12:02:00Z").getTime(),
      {
        source: "llm-reviewed",
        purpose: "Check one thread for release notes.",
        url: "https://old.reddit.com/r/example/comments/123",
        category: "work",
      }
    ),
    30,
    "old.reddit.com",
    new Date("2026-04-28T12:03:00Z").getTime()
  );

  const projection = buildDailyStatsProjection(stats, "old.reddit.com");
  assert.equal(projection.perSiteStatsToday["old.reddit.com"].accessPressure, 1);
  assert.equal(projection.categorySummaryToday.work.accessRequestsToday, 1);
  assert.equal(projection.categorySummaryToday.work.temporaryAllowsToday, 1);
  assert.equal(projection.categorySummaryToday.work.temporaryAllowUsedSecondsToday, 30);
  assert.equal(projection.recentSiteDecisions.length, 2);

  const context = buildAccessGateStatsContext(stats, "old.reddit.com");
  assert.equal(context.currentSiteStatsToday.blockedAttemptsToday, 1);
  assert.equal(context.categorySummaryToday.work.accessRequestsToday, 1);
  assert.equal(context.recentSiteDecisions[0].category, "work");
});

test("records denied request-gate reasons", () => {
  const stats = withRequestGateDecision(
    createEmptyDailyStats("2026-04-28"),
    {
      site: "old.reddit.com",
      action: "request-denied",
      scope: "none",
      minutes: null,
      source: "llm-reviewed",
      message: "Denied because the purpose was too vague.",
      purpose: "just because",
      url: null,
      provider: "chrome-local",
      model: "Chrome local LLM (Gemini Nano)",
    },
    new Date("2026-04-28T12:00:00Z").getTime()
  );

  const [decision] = stats.recentDecisions;
  assert.equal(decision.action, "request-denied");
  assert.equal(decision.source, "llm-reviewed");
  assert.equal(decision.message, "Denied because the purpose was too vague.");
  assert.equal(decision.purpose, "just because");
  assert.equal(decision.model, "Chrome local LLM (Gemini Nano)");
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
