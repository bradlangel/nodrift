import assert from "node:assert/strict";

import {
  createEmptyDailyStats,
  normalizeDailyStats,
  withRequestGateDecision,
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
