import assert from "node:assert/strict";

import { temporaryAllowGate } from "../../../dist/gates/temporary-allow/index.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const blockUrl = (ruleId, site) =>
  `chrome-extension://extension-id/pages/block.html?rid=${ruleId}&site=${encodeURIComponent(site)}`;

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
