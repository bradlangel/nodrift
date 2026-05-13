import assert from "node:assert/strict";

import {
  builtGate,
  normalizeBuiltGateSpec,
  normalizeBuiltGateSpecJson,
} from "../../../dist/gates/built-gate/index.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const spec = normalizeBuiltGateSpec({
  name: "Research gate",
  description: "Only allow specific research sessions.",
  questions: ["I am using this site to:", "I will stop when:"],
  requiredAnswerMinChars: 3,
  denyKeywords: ["scroll", "bored"],
  approveKeywords: ["research", "debug", "docs"],
  urlScopeKeywords: ["this page", "thread"],
  maxMinutes: 15,
  successMessage: "Research plan accepted.",
  failureMessage: "Research gate needs a specific plan.",
});

const baseContext = {
  rawUrl: "chrome-extension://extension-id/pages/block.html?rid=1&site=reddit.com",
  requestedScope: "domain",
  requestedUrl: "https://reddit.com/r/typescript/comments/123",
  blockedSites: ["reddit.com"],
  defaultMinutes: 30,
  requestedMinutes: 20,
  spec,
};

test("built gate approves a dynamic generated spec", () => {
  const decision = builtGate.decide({
    ...baseContext,
    requestedPurpose:
      "I am using this site to: research this page for a TypeScript debug issue\nI will stop when: I find the API answer",
  });

  assert.equal(decision.decision, "PASS_WITH_LIMIT");
  assert.equal(decision.scope, "url");
  assert.equal(decision.minutes, 15);
  assert.equal(decision.message, "Research plan accepted.");
});

test("built gate denies vague or blocked answers", () => {
  const decision = builtGate.decide({
    ...baseContext,
    requestedPurpose:
      "I am using this site to: scroll around\nI will stop when: later",
  });

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.message, "Research gate needs a specific plan.");
});

test("built gate normalizes generated JSON", () => {
  const normalized = JSON.parse(normalizeBuiltGateSpecJson({ name: "Tiny", questions: ["Why:"] }));
  assert.equal(normalized.name, "Tiny");
  assert.deepEqual(normalized.questions, ["Why:"]);
  assert.ok(normalized.approveKeywords.length > 0);
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
