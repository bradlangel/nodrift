import assert from "node:assert/strict";

import { aiStudyQuizGate } from "../../../dist/gates/ai-study-quiz/gate.js";
import {
  isCorrectQuizAnswer,
  parseAiStudyQuizChallenge,
} from "../../../dist/gates/ai-study-quiz/quiz.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const baseContext = {
  rawUrl: "chrome-extension://extension-id/pages/block.html?rid=1&site=youtube.com",
  requestedScope: "domain",
  requestedUrl: "https://youtube.com",
  blockedSites: ["youtube.com"],
  defaultMinutes: 10,
  topic: "TypeScript",
  requestedMinutes: 10,
};

test("parses AI quiz challenge JSON", () => {
  const challenge = parseAiStudyQuizChallenge(
    '{"question":"What keyword defines a type alias?","answer":"type","acceptableAnswers":["type"],"explanation":"Type aliases use the type keyword."}',
    "TypeScript",
    "challenge-1"
  );

  assert.equal(challenge?.question, "What keyword defines a type alias?");
  assert.deepEqual(challenge?.acceptableAnswers, ["type"]);
});

test("normalizes acceptable quiz answers", () => {
  assert.equal(isCorrectQuizAnswer("Type!", ["type"]), true);
  assert.equal(isCorrectQuizAnswer("interface", ["type"]), false);
});

test("AI study quiz gate approves correct answer", () => {
  const decision = aiStudyQuizGate.decide({
    ...baseContext,
    answer: "type",
    expectedAnswers: ["type"],
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.host, "youtube.com");
});

test("AI study quiz gate asks follow-up for wrong answer", () => {
  const decision = aiStudyQuizGate.decide({
    ...baseContext,
    answer: "interface",
    expectedAnswers: ["type"],
  });

  assert.equal(decision.decision, "ASK_FOLLOWUP");
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
