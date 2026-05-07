import assert from "node:assert/strict";

import {
  IF_THEN_INTENTION_TEMPLATE,
  ifThenIntentionGate,
  parseIfThenIntentionFields,
} from "../../../dist/gates/if-then-intention/gate.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const baseContext = {
  rawUrl: "chrome-extension://extension-id/pages/block.html?rid=1&site=reddit.com",
  requestedScope: "domain",
  requestedUrl: "https://reddit.com/r/typescript",
  blockedSites: ["reddit.com"],
  defaultMinutes: 10,
  currentUrl: "https://reddit.com/r/typescript",
  currentSite: "reddit.com",
  followUpAnswer: null,
};

test("if/then intention gate approves complete intention receipt", () => {
  const decision = ifThenIntentionGate.decide({
    ...baseContext,
    requestedPurpose:
      "I am using this site to read one TypeScript answer.\nI will stop when I understand the fix.\nIf I notice myself scrolling unrelated threads, then I will close the tab.",
    requestedMinutes: 10,
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.scope, "domain");
  assert.equal(decision.host, "reddit.com");
});

test("if/then intention gate accepts the baked-in template with filled fields", () => {
  const request = IF_THEN_INTENTION_TEMPLATE
    .replace("I am using this site to: ", "I am using this site to: read one docs answer")
    .replace("I will stop when: ", "I will stop when: the fix is clear")
    .replace(
      "If I notice myself drifting into: ",
      "If I notice myself drifting into: scrolling unrelated threads"
    )
    .replace("Then I will: ", "Then I will: close the tab");

  const fields = parseIfThenIntentionFields(request);
  assert.equal(fields.purpose, "read one docs answer");
  assert.equal(fields.response, "close the tab");

  const decision = ifThenIntentionGate.decide({
    ...baseContext,
    requestedPurpose: request,
    requestedMinutes: 10,
  });

  assert.equal(decision.decision, "PASS");
});

test("if/then intention gate denies incomplete plan", () => {
  const decision = ifThenIntentionGate.decide({
    ...baseContext,
    requestedPurpose: "I need to check something quickly.",
    requestedMinutes: 10,
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
