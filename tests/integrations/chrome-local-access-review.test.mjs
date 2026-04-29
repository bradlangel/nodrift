import assert from "node:assert/strict";

import { buildChromeLocalPrompt } from "../../dist/integrations/chrome-local-access-review.js";

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
    recentSiteDecisions: [],
  },
});

test("builds a text-native prompt with strict JSON response instructions", () => {
  const prompt = buildChromeLocalPrompt(baseContext());

  assert.match(prompt, /Return exactly one valid JSON object and nothing else\./);
  assert.match(prompt, /The first character must be \{/);
  assert.match(prompt, /"followUpQuestion":null/);
});

test("includes shared examples and the live request purpose", () => {
  const prompt = buildChromeLocalPrompt(baseContext());

  assert.match(prompt, /Purpose: "Just for fun but I should be working"/);
  assert.match(prompt, /"decision":"FAIL"/);
  assert.match(prompt, /"requestedPurpose": "Just for fun but I should be working"/);
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
