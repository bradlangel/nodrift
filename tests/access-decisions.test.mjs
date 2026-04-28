import assert from "node:assert/strict";

import { buildTemporaryAllowDecision } from "../dist/access-decisions.js";
import { buildDecisionApplication } from "../dist/core/decision-application.js";
import { temporaryAllowGate } from "../dist/gates/temporary-allow-gate.js";
import { agenticAccessGate } from "../dist/gates/agentic-access-gate.js";
import {
  findRuleIdByHostname,
  getRelatedRuleIdsForHost,
  hostMatchesSite,
} from "../dist/site-matching.js";
import { getTemporarilyAllowedDestination } from "../dist/temp-allow-destination.js";
import { buildParentDomainUrlFilter } from "../dist/url-filters.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const blockUrl = (ruleId, site) =>
  `chrome-extension://extension-id/block.html?rid=${ruleId}&site=${encodeURIComponent(site)}`;

test("parent-domain blocked site matching includes subdomains", () => {
  assert.equal(hostMatchesSite("youtube.com", "youtube.com"), true);
  assert.equal(hostMatchesSite("YouTube.com", "youtube.com"), true);
  assert.equal(hostMatchesSite("music.youtube.com", "youtube.com"), true);
  assert.equal(hostMatchesSite("studio.music.youtube.com", "youtube.com"), true);
  assert.equal(hostMatchesSite("youtube.com", "music.youtube.com"), false);
  assert.equal(hostMatchesSite("notyoutube.com", "youtube.com"), false);
});

test("blocked rule URL filter uses Chrome parent-domain matching", () => {
  assert.equal(buildParentDomainUrlFilter("youtube.com"), "||youtube.com^");
  assert.equal(buildParentDomainUrlFilter("www.youtube.com"), "||www.youtube.com^");
});

test("related rule lookup includes the parent domain family", () => {
  const blockedSites = ["youtube.com", "www.youtube.com", "music.youtube.com"];
  assert.deepEqual(getRelatedRuleIdsForHost("youtube.com", blockedSites), [1, 2, 3]);
  assert.deepEqual(getRelatedRuleIdsForHost("music.youtube.com", blockedSites), [1, 2, 3]);
  assert.deepEqual(getRelatedRuleIdsForHost("studio.youtube.com", blockedSites), [1, 2, 3]);
});

test("hostname rule lookup chooses the most specific matching blocked site", () => {
  const blockedSites = ["youtube.com", "www.youtube.com", "music.youtube.com"];
  assert.equal(findRuleIdByHostname("youtube.com", blockedSites), 1);
  assert.equal(findRuleIdByHostname("music.youtube.com", blockedSites), 3);
  assert.equal(findRuleIdByHostname("studio.youtube.com", blockedSites), 1);
});

test("domain temporary allow uses the matched blocked rule host", () => {
  const decision = buildTemporaryAllowDecision({
    rawUrl: blockUrl(2, "www.youtube.com"),
    requestedScope: "domain",
    blockedSites: ["youtube.com", "www.youtube.com", "music.youtube.com"],
    defaultMinutes: 30,
  });

  assert.ok(["PASS", "PASS_WITH_LIMIT"].includes(decision.decision));
  assert.equal(decision.host, "www.youtube.com");
  assert.deepEqual(decision.ruleIds, [1, 2, 3]);
});

test("URL temporary allow accepts a subdomain URL within a blocked parent domain", () => {
  const decision = buildTemporaryAllowDecision({
    rawUrl: blockUrl(1, "youtube.com"),
    requestedScope: "url",
    requestedUrl: "https://music.youtube.com/watch?v=abc#section",
    blockedSites: ["youtube.com"],
    defaultMinutes: 10,
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.scope, "url");
  assert.equal(decision.host, "youtube.com");
  assert.equal(decision.url, "https://music.youtube.com/watch?v=abc#section");
  assert.deepEqual(decision.ruleIds, [1]);
});

test("URL temporary allow accepts the exact blocked host", () => {
  const decision = buildTemporaryAllowDecision({
    rawUrl: blockUrl(1, "youtube.com"),
    requestedScope: "url",
    requestedUrl: "https://youtube.com/watch?v=abc",
    blockedSites: ["youtube.com"],
    defaultMinutes: 10,
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.scope, "url");
  assert.equal(decision.host, "youtube.com");
  assert.deepEqual(decision.ruleIds, [1]);
});

test("URL temporary allow rejects parent hosts for a blocked subdomain", () => {
  const decision = buildTemporaryAllowDecision({
    rawUrl: blockUrl(1, "music.youtube.com"),
    requestedScope: "url",
    requestedUrl: "https://youtube.com/watch?v=abc",
    blockedSites: ["music.youtube.com"],
    defaultMinutes: 10,
  });

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.scope, "none");
  assert.equal(decision.message, "Requested URL does not match blocked host.");
});

test("URL temporary allow rejects unrelated hosts", () => {
  const decision = buildTemporaryAllowDecision({
    rawUrl: blockUrl(1, "youtube.com"),
    requestedScope: "url",
    requestedUrl: "https://example.com/watch?v=abc",
    blockedSites: ["youtube.com"],
    defaultMinutes: 10,
  });

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.scope, "none");
  assert.equal(decision.message, "Requested URL does not match blocked host.");
});

test("temporary allow destination accepts subdomain ledger URLs for parent blocked sites", async () => {
  const destination = await getTemporarilyAllowedDestination(
    { url: blockUrl(1, "youtube.com"), tabId: 10 },
    null,
    {
      getLedgerUrl: () => "https://music.youtube.com/watch?v=abc",
      getTabNavigatedHttpUrl: async () => "https://youtube.com/",
    }
  );

  assert.equal(destination, "https://music.youtube.com/watch?v=abc");
});

test("temporary allow destination ignores parent ledger URLs for subdomain blocked sites", async () => {
  const destination = await getTemporarilyAllowedDestination(
    { url: blockUrl(1, "music.youtube.com"), tabId: 10 },
    null,
    {
      getLedgerUrl: () => "https://youtube.com/watch?v=abc",
      getTabNavigatedHttpUrl: async () => "https://example.com/",
    }
  );

  assert.equal(destination, "https://music.youtube.com/");
});

test("decision application maps domain pass to allow-domain operation", () => {
  const application = buildDecisionApplication({
    decision: "PASS",
    scope: "domain",
    minutes: 25,
    host: "youtube.com",
    url: null,
    ruleIds: [1, 2],
  });

  assert.equal(application.operation, "allow-domain");
  assert.deepEqual(application.ruleIds, [1, 2]);
  assert.equal(application.minutes, 25);
});

test("decision application maps ASK_FOLLOWUP to no-op", () => {
  const application = buildDecisionApplication({
    decision: "ASK_FOLLOWUP",
    scope: "none",
    minutes: 15,
    host: null,
    url: null,
    ruleIds: [],
    message: "Need one more detail",
  });

  assert.equal(application.operation, "none");
  assert.equal(application.decision, "ASK_FOLLOWUP");
  assert.equal(application.message, "Need one more detail");
});

test("temporary allow gate exposes the shared access gate contract", () => {
  const decision = temporaryAllowGate.decide({
    rawUrl: blockUrl(1, "youtube.com"),
    requestedScope: "url",
    requestedUrl: "https://youtube.com/watch?v=abc",
    blockedSites: ["youtube.com"],
    defaultMinutes: 10,
  });

  assert.equal(temporaryAllowGate.id, "temporary-allow");
  assert.equal(decision.decision, "PASS");
  assert.equal(decision.scope, "url");
});

test("agentic access passes deliberate legitimate request", () => {
  const decision = agenticAccessGate.decide({
    rawUrl: blockUrl(1, "youtube.com"),
    blockedSites: ["youtube.com"],
    defaultMinutes: 30,
    requestedPurpose: "Need to debug an issue using a docs walkthrough",
    requestedMinutes: 20,
    currentUrl: "https://youtube.com/watch?v=abc",
  });

  assert.ok(["PASS", "PASS_WITH_LIMIT"].includes(decision.decision));
});

test("agentic access asks follow-up for vague request", () => {
  const decision = agenticAccessGate.decide({
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

test("agentic access fails obvious autopilot request", () => {
  const decision = agenticAccessGate.decide({
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

test("agentic access limits excessive duration", () => {
  const decision = agenticAccessGate.decide({
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

test("agentic access can grant URL-scoped access for exact-page intent", () => {
  const decision = agenticAccessGate.decide({
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
