import assert from "node:assert/strict";

import { buildAccessReviewPolicy } from "../../dist/integrations/access-review-policy.js";
import {
  buildOpenAiStatsSnippet,
  extractOpenAiOutputText,
  getOpenAiAccessReviewReasoningEffort,
  normalizeReviewLevel,
} from "../../dist/integrations/openai-access-review.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

test("extracts root output text", () => {
  assert.equal(extractOpenAiOutputText({ output_text: '{"decision":"PASS"}' }), '{"decision":"PASS"}');
});

test("extracts message text after reasoning output", () => {
  const response = {
    output: [
      {
        type: "reasoning",
        summary: [],
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: '{"decision":"PASS","scope":"url"}',
          },
        ],
      },
    ],
  };

  assert.equal(extractOpenAiOutputText(response), '{"decision":"PASS","scope":"url"}');
});

test("returns null when no output text is present", () => {
  assert.equal(extractOpenAiOutputText({ output: [{ type: "reasoning", summary: [] }] }), null);
});

test("selects low-cost reasoning effort for access review models", () => {
  assert.equal(getOpenAiAccessReviewReasoningEffort("gpt-5-nano"), "minimal");
  assert.equal(getOpenAiAccessReviewReasoningEffort("gpt-5.1"), "none");
  assert.equal(getOpenAiAccessReviewReasoningEffort("o4-mini"), "low");
  assert.equal(getOpenAiAccessReviewReasoningEffort("gpt-4o-mini"), null);
});

test("normalizes numeric and legacy review levels", () => {
  assert.equal(normalizeReviewLevel("1"), 1);
  assert.equal(normalizeReviewLevel("3"), 3);
  assert.equal(normalizeReviewLevel("5"), 5);
  assert.equal(normalizeReviewLevel("lenient"), 2);
  assert.equal(normalizeReviewLevel("balanced"), 3);
  assert.equal(normalizeReviewLevel("strict"), 4);
  assert.equal(normalizeReviewLevel("surprise"), 3);
});

test("shared access review policy includes local-model steering examples", () => {
  const policy = buildAccessReviewPolicy(3, 3);
  const failureExample = policy.examples.find((example) =>
    example.requestedPurpose.includes("Just for fun")
  );

  assert.equal(failureExample?.decision, "FAIL");
  assert.match(failureExample?.message || "", /I should be working/);
  assert.ok(
    policy.constraints.some((constraint) => constraint.includes("admits avoidance of work"))
  );
  assert.ok(
    policy.constraints.some((constraint) => constraint.includes("Never reuse names"))
  );
  assert.ok(!JSON.stringify(policy.examples).includes("bug in library X"));
});

test("shared access review policy includes a mini rubric", () => {
  const policy = buildAccessReviewPolicy(4, 2);

  assert.ok(policy.rubric.some((item) => item.startsWith("specificity:")));
  assert.ok(policy.rubric.some((item) => item.startsWith("necessity:")));
  assert.ok(policy.rubric.some((item) => item.startsWith("boundedness:")));
  assert.ok(policy.rubric.some((item) => item.startsWith("obligation conflict:")));
  assert.ok(
    policy.constraints.some((constraint) =>
      constraint.includes("deny casual requests rather than asking for more detail")
    )
  );
});

test("includes richer local stats context for OpenAI requests", () => {
  const snippet = buildOpenAiStatsSnippet({
    blockedAttemptsToday: 2,
    temporaryAllowsToday: 1,
    temporaryAllowUsedSecondsToday: 90,
    globalStatsToday: {
      blockedAttemptsToday: 3,
      temporaryAllowsToday: 1,
      temporaryAllowUsedSecondsToday: 90,
    },
    currentSiteStatsToday: {
      site: "news.ycombinator.com",
      blockedAttemptsToday: 2,
      temporaryAllowsToday: 1,
      temporaryAllowUsedSecondsToday: 90,
      accessPressure: 0.5,
      lastTemporaryAccessAt: 1770000000000,
    },
    categorySummaryToday: {
      work: {
        accessRequestsToday: 1,
        temporaryAllowsToday: 1,
        requestDenialsToday: 0,
        followUpsToday: 0,
        grantedMinutesToday: 10,
        requestedMinutesToday: 15,
        temporaryAllowUsedSecondsToday: 90,
      },
    },
    recentSiteDecisions: [
      {
        timestamp: 1770000000000,
        decision: "temporary-allow",
        minutes: 10,
        scope: "domain",
        source: "llm-reviewed",
        category: "work",
      },
    ],
  });

  assert.equal(snippet.currentSiteStatsToday.site, "news.ycombinator.com");
  assert.equal(snippet.categorySummaryToday.work.accessRequestsToday, 1);
  assert.equal(snippet.recentSiteDecisions[0].category, "work");
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
