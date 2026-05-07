import assert from "node:assert/strict";

import {
  githubContributionGate,
  normalizeGithubUsername,
} from "../../../dist/gates/github-contribution/gate.js";
import { countRecentGithubContributionEvents } from "../../../dist/gates/github-contribution/request.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const baseContext = {
  rawUrl: "chrome-extension://extension-id/pages/block.html?rid=1&site=x.com",
  requestedScope: "domain",
  requestedUrl: "https://x.com",
  blockedSites: ["x.com"],
  defaultMinutes: 10,
  username: "octocat",
  contributionDate: "2026-05-07",
  requestedMinutes: 10,
};

test("normalizes public GitHub usernames", () => {
  assert.equal(normalizeGithubUsername("@octocat"), "octocat");
  assert.equal(normalizeGithubUsername("-bad"), null);
});

test("github contribution gate approves positive contribution count", () => {
  const decision = githubContributionGate.decide({
    ...baseContext,
    contributionCount: 20,
    recentContributionCount: 0,
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.host, "x.com");
});

test("github contribution gate approves recent public contribution events", () => {
  const decision = githubContributionGate.decide({
    ...baseContext,
    contributionCount: 0,
    recentContributionCount: 1,
  });

  assert.equal(decision.decision, "PASS");
});

test("github contribution gate denies when recent activity and daily threshold miss", () => {
  const decision = githubContributionGate.decide({
    ...baseContext,
    contributionCount: 3,
    recentContributionCount: 0,
  });

  assert.equal(decision.decision, "FAIL");
});

test("counts recent public GitHub contribution events", () => {
  const now = Date.parse("2026-05-07T12:00:00Z");
  const count = countRecentGithubContributionEvents(
    [
      {
        type: "PushEvent",
        created_at: "2026-05-07T11:30:00Z",
        payload: { commits: [{ sha: "1" }, { sha: "2" }] },
      },
      {
        type: "PullRequestReviewEvent",
        created_at: "2026-05-07T10:15:00Z",
        payload: { action: "submitted" },
      },
      {
        type: "WatchEvent",
        created_at: "2026-05-07T11:50:00Z",
        payload: { action: "started" },
      },
      {
        type: "IssuesEvent",
        created_at: "2026-05-07T08:00:00Z",
        payload: { action: "opened" },
      },
    ],
    now,
    120
  );

  assert.equal(count, 3);
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

if (failures > 0) process.exitCode = 1;
