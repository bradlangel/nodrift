import assert from "node:assert/strict";

import {
  githubContributionGate,
  normalizeGithubUsername,
} from "../../../dist/gates/github-contribution/gate.js";

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
    contributionCount: 1,
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.host, "x.com");
});

test("github contribution gate denies zero contribution count", () => {
  const decision = githubContributionGate.decide({
    ...baseContext,
    contributionCount: 0,
  });

  assert.equal(decision.decision, "FAIL");
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
