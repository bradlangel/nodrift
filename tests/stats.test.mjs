import assert from "node:assert/strict";

import {
  createEmptyDailyStats,
  normalizeDailyStats,
  withTemporaryAllow,
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
    }
  );

  const [decision] = stats.recentDecisions;
  assert.equal(decision.scope, "url");
  assert.equal(decision.source, "llm-reviewed");
  assert.equal(decision.message, "Approved for a specific page.");
  assert.equal(decision.purpose, "Check one thread for release notes.");
  assert.equal(decision.url, "https://old.reddit.com/r/example/comments/123");
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
      },
    ],
  };

  const stats = normalizeDailyStats(raw, new Date("2026-04-28T12:01:00Z").getTime());
  const [decision] = stats.recentDecisions;
  assert.equal(decision.scope, "url");
  assert.equal(decision.source, "llm-reviewed");
  assert.equal(decision.message, "Approved with extra whitespace.");
  assert.equal(decision.purpose.length, 220);
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
