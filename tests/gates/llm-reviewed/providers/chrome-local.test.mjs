import assert from "node:assert/strict";

import {
  buildChromeLocalAnalysisPrompt,
  buildChromeLocalDecisionPrompt,
  buildChromeLocalPrompt,
  hasChromeLocalProviderConfig,
  normalizeChromeLocalRequestAnalysis,
  requestChromeLocalAccessReview,
} from "../../../../dist/gates/llm-reviewed/providers/chrome-local.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const baseContext = () => ({
  blockedDomain: "news.ycombinator.com",
  requestedUrl: "https://news.ycombinator.com/item?id=123",
  requestedPurpose: "Just for fun but I should be working",
  requestedMinutes: 15,
  reviewStrictnessLevel: 3,
  leisureAllowanceLevel: 3,
  currentTimeIso: "2026-04-29T17:00:00.000Z",
  dayOfWeek: "Wednesday",
  stats: {
    blockedAttemptsToday: 1,
    temporaryAllowsToday: 0,
    temporaryAllowUsedSecondsToday: 0,
    globalStatsToday: {
      blockedAttemptsToday: 4,
      temporaryAllowsToday: 1,
      temporaryAllowUsedSecondsToday: 120,
    },
    currentSiteStatsToday: {
      site: "news.ycombinator.com",
      blockedAttemptsToday: 1,
      temporaryAllowsToday: 0,
      temporaryAllowUsedSecondsToday: 0,
      accessPressure: 0,
      lastTemporaryAccessAt: null,
    },
    categorySummaryToday: {
      "unplanned-leisure": {
        accessRequestsToday: 1,
        temporaryAllowsToday: 0,
        requestDenialsToday: 1,
        followUpsToday: 0,
        grantedMinutesToday: 0,
        requestedMinutesToday: 15,
        temporaryAllowUsedSecondsToday: 0,
      },
    },
    recentSiteDecisions: [
      {
        timestamp: 1770000000000,
        decision: "request-denied",
        scope: "none",
        source: "llm-reviewed",
        category: "unplanned-leisure",
      },
    ],
  },
});

test("builds a text-native prompt with strict JSON response instructions", () => {
  const prompt = buildChromeLocalPrompt(baseContext());

  assert.match(prompt, /Return exactly one valid JSON object and nothing else\./);
  assert.match(prompt, /The first character must be \{/);
  assert.match(prompt, /"followUpQuestion":null/);
});

test("builds an analysis prompt with local stats context", () => {
  const prompt = buildChromeLocalAnalysisPrompt(baseContext());

  assert.match(prompt, /Analyze one temporary access request/);
  assert.match(prompt, /"category":"unclear"/);
  assert.match(prompt, /"requestedPurpose": "Just for fun but I should be working"/);
  assert.match(prompt, /"currentSiteStatsToday": \{/);
  assert.match(prompt, /"categorySummaryToday": \{/);
  assert.match(prompt, /"category": "unplanned-leisure"/);
});

test("builds a decision prompt from prior analysis and live request", () => {
  const prompt = buildChromeLocalDecisionPrompt(baseContext(), {
    category: "unplanned-leisure",
    specificity: "vague",
    boundedness: "unbounded",
    risk: "high",
    requestEvidence: "Just for fun but I should be working",
    contextEvidence: "one recent denial for this site",
  });

  assert.match(prompt, /Decide one temporary access request/);
  assert.match(prompt, /Prior analysis:/);
  assert.match(prompt, /"requestedPurpose": "Just for fun but I should be working"/);
  assert.match(prompt, /"contextEvidence": "one recent denial for this site"/);
  assert.doesNotMatch(prompt, /bug in library X/);
});

test("normalizes local request analysis", () => {
  const analysis = normalizeChromeLocalRequestAnalysis(`{
    "category": "planned-leisure",
    "specificity": "specific",
    "boundedness": "bounded",
    "risk": "low",
    "requestEvidence": "one saved article",
    "contextEvidence": "no recent temporary access for this site"
  }`);

  assert.equal(analysis.category, "planned-leisure");
  assert.equal(analysis.specificity, "specific");
  assert.equal(analysis.boundedness, "bounded");
  assert.equal(analysis.risk, "low");
  assert.equal(analysis.requestEvidence, "one saved article");
  assert.equal(analysis.contextEvidence, "no recent temporary access for this site");
});

test("rejects invalid local request analysis", () => {
  assert.equal(normalizeChromeLocalRequestAnalysis('{"category":"work"}'), null);
});

test("disables Chrome local provider config on Firefox runtime", () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      id: "fallback-id",
      getURL: (path = "") =>
        `moz-extension://firefox-extension-id/${String(path).replace(/^\//, "")}`,
    },
  };

  try {
    assert.equal(hasChromeLocalProviderConfig({ provider: "chrome-local" }), false);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("runs local access review as analysis then decision prompts", async () => {
  const prompts = [];
  const previousLanguageModel = globalThis.LanguageModel;
  globalThis.LanguageModel = {
    availability: async () => "available",
    create: async () => ({
      prompt: async (prompt) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return JSON.stringify({
            category: "maintenance",
            specificity: "specific",
            boundedness: "bounded",
            risk: "low",
            requestEvidence: "test to see if access is granted",
            contextEvidence: null,
          });
        }
        return JSON.stringify({
          decision: "PASS_WITH_LIMIT",
          scope: "domain",
          minutes: 10,
          message: "Approved because this is a bounded test of the access flow.",
          followUpQuestion: null,
        });
      },
      destroy: () => undefined,
    }),
  };

  try {
    const result = await requestChromeLocalAccessReview(baseContext());
    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /Analyze one temporary access request/);
    assert.match(prompts[1], /Decide one temporary access request/);
    assert.match(prompts[1], /test to see if access is granted/);
    assert.equal(
      result,
      '{"decision":"PASS_WITH_LIMIT","scope":"domain","minutes":10,"message":"Approved because this is a bounded test of the access flow.","followUpQuestion":null}'
    );
  } finally {
    globalThis.LanguageModel = previousLanguageModel;
  }
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
