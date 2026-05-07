import assert from "node:assert/strict";

import {
  findGateModuleByActionId,
  findGateModuleByMessageType,
  GATE_BLOCK_PAGE_ACTION_CAPABILITIES,
  GATE_MODULES,
} from "../../dist/gates/registry.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

test("registry exposes all compiled-in access gates", () => {
  assert.deepEqual(
    GATE_MODULES.map((module) => module.id),
    [
      "temporary-allow",
      "local-intent-access",
      "llm-reviewed-access",
      "if-then-intention-access",
      "github-contribution-access",
      "ai-study-quiz-access",
    ]
  );
});

test("registry derives block-page gate capabilities", () => {
  assert.deepEqual(
    GATE_BLOCK_PAGE_ACTION_CAPABILITIES.map((capability) => capability.id),
    [
      "temporary-allow-domain",
      "local-intent-request-access",
      "llm-reviewed-request-access",
      "if-then-intention-request-access",
      "github-contribution-request-access",
      "ai-study-quiz-request-access",
    ]
  );
});

test("registry resolves gates by action id and message type", () => {
  assert.equal(
    findGateModuleByActionId("llm-reviewed-request-access")?.id,
    "llm-reviewed-access"
  );
  assert.equal(
    findGateModuleByMessageType("request-local-intent-access")?.id,
    "local-intent-access"
  );
  assert.equal(
    findGateModuleByMessageType("request-ai-study-quiz-access")?.id,
    "ai-study-quiz-access"
  );
  assert.equal(findGateModuleByActionId("missing"), null);
});

test("registry exposes gate options metadata", () => {
  const llmGate = findGateModuleByActionId("llm-reviewed-request-access");
  assert.equal(llmGate?.options?.detailsSummary, "Settings");
  assert.deepEqual(
    llmGate?.options?.providerGroup?.providers.map((provider) => provider.id),
    ["chrome-local", "openai"]
  );
  assert.equal(
    findGateModuleByActionId("temporary-allow-domain")?.options?.detailsSummary,
    "Details"
  );
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
