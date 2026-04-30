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
    ["temporary-allow", "local-intent-access", "llm-reviewed-access"]
  );
});

test("registry derives block-page gate capabilities", () => {
  assert.deepEqual(
    GATE_BLOCK_PAGE_ACTION_CAPABILITIES.map((capability) => capability.id),
    [
      "temporary-allow-domain",
      "local-intent-request-access",
      "llm-reviewed-request-access",
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
  assert.equal(findGateModuleByActionId("missing"), null);
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
