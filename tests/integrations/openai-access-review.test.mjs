import assert from "node:assert/strict";

import {
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
