import assert from "node:assert/strict";

import {
  ACCESS_EFFECT_MODULES,
  buildAccessEffectCss,
  getAccessEffectMilestones,
  normalizeAccessEffectIds,
} from "../../dist/access-effects/registry.js";
import {
  DEFAULT_ACCESS_EFFECT_IDS,
  GRAYSCALE_ACCESS_EFFECT_ID,
  STALE_MODE_ACCESS_EFFECT_ID,
} from "../../dist/defaults.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const session = {
  source: "temporary-allow",
  scope: "domain",
  host: "example.com",
  url: null,
  startedAt: 1_000,
  expiresAt: 61_000,
};

test("registry exposes compiled-in access effects", () => {
  assert.deepEqual(
    ACCESS_EFFECT_MODULES.map((module) => module.id),
    [GRAYSCALE_ACCESS_EFFECT_ID, STALE_MODE_ACCESS_EFFECT_ID]
  );
  assert.deepEqual(
    ACCESS_EFFECT_MODULES.find((module) => module.id === STALE_MODE_ACCESS_EFFECT_ID)
      ?.timeline?.map((step) => step.atPercent),
    [0, 25, 50, 75, 90]
  );
});

test("selected effect ids are normalized and de-duplicated", () => {
  assert.deepEqual(
    normalizeAccessEffectIds([
      GRAYSCALE_ACCESS_EFFECT_ID,
      "missing",
      STALE_MODE_ACCESS_EFFECT_ID,
      GRAYSCALE_ACCESS_EFFECT_ID,
    ]),
    [GRAYSCALE_ACCESS_EFFECT_ID, STALE_MODE_ACCESS_EFFECT_ID]
  );
  assert.deepEqual(normalizeAccessEffectIds(null), DEFAULT_ACCESS_EFFECT_IDS);
  assert.deepEqual(normalizeAccessEffectIds([], DEFAULT_ACCESS_EFFECT_IDS), []);
});

test("effect css composes selected modules", () => {
  const css = buildAccessEffectCss(
    [GRAYSCALE_ACCESS_EFFECT_ID, STALE_MODE_ACCESS_EFFECT_ID],
    {
      session,
      now: 46_000,
      progress: 0.75,
    }
  );

  assert.match(css, /grayscale\(1\)/);
  assert.match(css, /blur\(6px\)/);
  assert.match(css, /shreddit-post/);
  assert.match(css, /opacity: 0\.78/);
});

test("milestones are merged and sorted", () => {
  assert.deepEqual(
    getAccessEffectMilestones([
      STALE_MODE_ACCESS_EFFECT_ID,
      GRAYSCALE_ACCESS_EFFECT_ID,
    ]),
    [0, 25, 50, 75, 90]
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
