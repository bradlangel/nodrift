import assert from "node:assert/strict";

import { validateLlmReviewedDecision } from "../../../dist/gates/llm-reviewed/decision.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const baseContext = () => ({
  host: "news.ycombinator.com",
  ruleIds: [1],
  requestedUrl: "https://news.ycombinator.com/item?id=123",
  requestedMinutes: 40,
  defaultMinutes: 15,
  maxMinutes: 25,
  followUpCount: 0,
  requestedPurpose: "Need this specific page to verify one implementation detail",
});

test("parses valid pass decision and clamps duration", () => {
  const decision = validateLlmReviewedDecision(
    {
      decision: "PASS",
      scope: "domain",
      minutes: 200,
      message: "Approved.",
    },
    baseContext()
  );

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.minutes, 25);
});

test("prefers url scope when purpose asks for one page", () => {
  const decision = validateLlmReviewedDecision(
    {
      decision: "PASS",
      scope: "domain",
      minutes: 10,
    },
    baseContext()
  );

  assert.equal(decision.scope, "url");
  assert.equal(decision.url, "https://news.ycombinator.com/item?id=123");
});

test("uses domain scope for site homepage approvals", () => {
  const decision = validateLlmReviewedDecision(
    {
      decision: "PASS",
      scope: "url",
      minutes: 10,
      message: "Approved for browsing Hacker News.",
      followUpQuestion: null,
    },
    {
      ...baseContext(),
      requestedUrl: "https://news.ycombinator.com/",
      requestedPurpose: "I need to browse Hacker News and open comment sections for research",
    }
  );

  assert.equal(decision.scope, "domain");
  assert.equal(decision.url, null);
});

test("uses domain scope for root URL with queryless homepage", () => {
  const decision = validateLlmReviewedDecision(
    {
      decision: "PASS",
      scope: "url",
      minutes: 10,
      message: "Approved.",
      followUpQuestion: null,
    },
    {
      ...baseContext(),
      requestedUrl: "https://news.ycombinator.com",
      requestedPurpose: "Open Hacker News for one specific research pass",
    }
  );

  assert.equal(decision.scope, "domain");
});

test("allows at most one follow-up", () => {
  const once = validateLlmReviewedDecision(
    {
      decision: "ASK_FOLLOWUP",
      followUpQuestion: "What exact thread do you need?",
    },
    baseContext()
  );
  assert.equal(once.decision, "ASK_FOLLOWUP");

  const twice = validateLlmReviewedDecision(
    {
      decision: "ASK_FOLLOWUP",
      followUpQuestion: "Need more detail",
    },
    { ...baseContext(), followUpCount: 1 }
  );
  assert.equal(twice.decision, "FAIL");
});

test("invalid model output fails closed", () => {
  const decision = validateLlmReviewedDecision("not-json", baseContext());

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.scope, "none");
  assert.equal(
    decision.message,
    "The provider did not return readable decision JSON, so access stayed blocked."
  );
});

test("invalid decision preserves model reason when present", () => {
  const decision = validateLlmReviewedDecision(
    {
      decision: "MAYBE",
      scope: "none",
      minutes: 10,
      message: "I could not decide because the request was ambiguous.",
    },
    baseContext()
  );

  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.message, "I could not decide because the request was ambiguous.");
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
