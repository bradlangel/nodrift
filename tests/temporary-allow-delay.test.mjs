import assert from "node:assert/strict";

import {
  DEFAULT_INCREASING_ALLOW_DELAY_ENABLED,
} from "../dist/defaults.js";
import {
  buildTemporaryAllowDelayTargetKey,
  evaluateTemporaryAllowDelay,
  getGlobalTemporaryAllowDelaySeconds,
  normalizePendingTemporaryAllowDelay,
} from "../dist/temporary-allow-delay.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

test("enables increasing delay by default", () => {
  assert.equal(DEFAULT_INCREASING_ALLOW_DELAY_ENABLED, true);
});

test("uses the global successful allow count for capped exponential delay", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 20].map(getGlobalTemporaryAllowDelaySeconds),
    [0, 5, 10, 20, 40, 60, 60, 60]
  );
});

test("starts a wait after the first successful allow of the day", () => {
  const result = evaluateTemporaryAllowDelay({
    enabled: true,
    successfulAllowsToday: 2,
    dayKey: "2026-07-24",
    targetKey: "domain:reddit.com",
    now: 1_000,
  });

  assert.equal(result.status, "waiting");
  assert.equal(result.delaySeconds, 10);
  assert.equal(result.remainingSeconds, 10);
  assert.equal(result.readyAt, 11_000);
  assert.equal(result.pending.allowCountToday, 2);
});

test("reuses a matching pending wait and becomes ready at its deadline", () => {
  const pending = {
    dayKey: "2026-07-24",
    targetKey: "domain:reddit.com",
    allowCountToday: 1,
    readyAt: 6_000,
  };

  const waiting = evaluateTemporaryAllowDelay({
    enabled: true,
    successfulAllowsToday: 1,
    dayKey: "2026-07-24",
    targetKey: "domain:reddit.com",
    pending,
    now: 3_500,
  });
  const ready = evaluateTemporaryAllowDelay({
    enabled: true,
    successfulAllowsToday: 1,
    dayKey: "2026-07-24",
    targetKey: "domain:reddit.com",
    pending,
    now: 6_000,
  });

  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.remainingSeconds, 3);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.pending, pending);
});

test("starts a fresh wait when the global count, day, or target changes", () => {
  const pending = {
    dayKey: "2026-07-24",
    targetKey: "domain:reddit.com",
    allowCountToday: 1,
    readyAt: 1_000,
  };
  const changed = evaluateTemporaryAllowDelay({
    enabled: true,
    successfulAllowsToday: 2,
    dayKey: "2026-07-24",
    targetKey: "domain:youtube.com",
    pending,
    now: 10_000,
  });

  assert.equal(changed.status, "waiting");
  assert.equal(changed.readyAt, 20_000);
  assert.equal(changed.pending.allowCountToday, 2);
  assert.equal(changed.pending.targetKey, "domain:youtube.com");
});

test("disabled delay and the first allow are immediately ready", () => {
  assert.equal(
    evaluateTemporaryAllowDelay({
      enabled: false,
      successfulAllowsToday: 10,
      dayKey: "2026-07-24",
      targetKey: "domain:reddit.com",
    }).status,
    "ready"
  );
  assert.equal(
    evaluateTemporaryAllowDelay({
      enabled: true,
      successfulAllowsToday: 0,
      dayKey: "2026-07-24",
      targetKey: "domain:reddit.com",
    }).status,
    "ready"
  );
});

test("normalizes pending state and builds stable target keys", () => {
  assert.equal(normalizePendingTemporaryAllowDelay({ readyAt: 1 }), null);
  assert.deepEqual(
    normalizePendingTemporaryAllowDelay({
      dayKey: "2026-07-24",
      targetKey: "domain:reddit.com",
      allowCountToday: 1.8,
      readyAt: 5_000,
    }),
    {
      dayKey: "2026-07-24",
      targetKey: "domain:reddit.com",
      allowCountToday: 1,
      readyAt: 5_000,
    }
  );
  assert.equal(
    buildTemporaryAllowDelayTargetKey({
      scope: "domain",
      host: "reddit.com",
    }),
    "domain:reddit.com"
  );
  assert.equal(
    buildTemporaryAllowDelayTargetKey({
      scope: "url",
      host: "reddit.com",
      url: "https://reddit.com/r/test",
    }),
    "url:https://reddit.com/r/test"
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
