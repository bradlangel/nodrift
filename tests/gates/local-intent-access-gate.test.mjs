import assert from "node:assert/strict";

import { localIntentAccessGate } from "../../dist/gates/local-intent-access-gate.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const blockUrl = (ruleId, site) =>
  `chrome-extension://extension-id/block.html?rid=${ruleId}&site=${encodeURIComponent(site)}`;

test("local intent check passes deliberate legitimate request", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "youtube.com"),
    blockedSites: ["youtube.com"],
    defaultMinutes: 30,
    requestedPurpose: "Need to debug an issue using a docs walkthrough",
    requestedMinutes: 20,
    currentUrl: "https://youtube.com/watch?v=abc",
  });

  assert.ok(["PASS", "PASS_WITH_LIMIT"].includes(decision.decision));
});

test("local intent check asks follow-up for vague request", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "reddit.com"),
    blockedSites: ["reddit.com"],
    defaultMinutes: 20,
    requestedPurpose: "checking something",
    requestedMinutes: 10,
    currentUrl: "https://reddit.com/r/typescript",
  });

  assert.equal(decision.decision, "ASK_FOLLOWUP");
  assert.equal(decision.scope, "none");
});

test("local intent check fails after vague follow-up", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "reddit.com"),
    blockedSites: ["reddit.com"],
    defaultMinutes: 20,
    requestedPurpose: "checking something",
    requestedMinutes: 10,
    currentUrl: "https://reddit.com/r/typescript",
    followUpAnswer: "not sure",
  });

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.scope, "none");
});

test("local intent check fails obvious autopilot request", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "reddit.com"),
    blockedSites: ["reddit.com"],
    defaultMinutes: 20,
    requestedPurpose: "scroll because I'm bored",
    requestedMinutes: 10,
    currentUrl: "https://reddit.com/r/popular",
  });

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.scope, "none");
});

test("local intent check limits excessive duration", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "reddit.com"),
    blockedSites: ["reddit.com"],
    defaultMinutes: 20,
    requestedPurpose: "planned downtime watching one creator",
    requestedMinutes: 120,
    currentUrl: "https://reddit.com/r/videos",
  });

  assert.equal(decision.decision, "PASS_WITH_LIMIT");
  assert.equal(decision.minutes, 45);
});

test("local intent check can grant URL-scoped access for exact-page intent", () => {
  const decision = localIntentAccessGate.decide({
    rawUrl: blockUrl(1, "news.ycombinator.com"),
    blockedSites: ["news.ycombinator.com"],
    defaultMinutes: 20,
    requestedPurpose: "Need this specific page article to verify an implementation detail",
    requestedMinutes: 25,
    currentUrl: "https://news.ycombinator.com/item?id=123",
  });

  assert.equal(decision.decision, "PASS_WITH_LIMIT");
  assert.equal(decision.scope, "url");
  assert.equal(decision.url, "https://news.ycombinator.com/item?id=123");
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
