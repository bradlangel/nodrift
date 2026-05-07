import assert from "node:assert/strict";

import { aiStudyQuizGate } from "../../../dist/gates/ai-study-quiz/gate.js";
import {
  parseQuizAnswerList,
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
    JSON.stringify({
      questions: [
        {
          question: "What keyword defines a type alias?",
          choices: ["type", "interface", "class", "enum"],
          answer: "type",
          acceptableAnswers: ["A", "type"],
          explanation: "Type aliases use the type keyword.",
        },
        {
          question: "Which keyword declares a contract shape?",
          choices: ["return", "interface", "await", "throw"],
          answer: "interface",
          acceptableAnswers: ["B", "interface"],
          explanation: "Interfaces declare object contracts.",
        },
        {
          question: "Which file extension usually contains TypeScript?",
          choices: [".css", ".html", ".ts", ".png"],
          answer: ".ts",
          acceptableAnswers: ["C", ".ts", "ts"],
          explanation: "TypeScript files commonly use .ts.",
        },
      ],
    }),
    "TypeScript",
    "challenge-1"
  );

  assert.equal(challenge?.questions.length, 3);
  assert.equal(challenge?.questions[0].question, "What keyword defines a type alias?");
  assert.deepEqual(challenge?.questions[0].acceptableAnswers, ["A", "type"]);
});

test("normalizes acceptable quiz answers", () => {
  assert.equal(isCorrectQuizAnswer("Type!", ["type"]), true);
  assert.equal(isCorrectQuizAnswer("interface", ["type"]), false);
});

test("parses answer lists from numbered lines", () => {
  assert.deepEqual(parseQuizAnswerList("1. A\n2. interface\n3. C"), [
    "A",
    "interface",
    "C",
  ]);
  assert.deepEqual(parseQuizAnswerList("A B C"), ["A", "B", "C"]);
  assert.deepEqual(parseQuizAnswerList("ABC"), ["A", "B", "C"]);
});

test("AI study quiz gate approves all correct answers", () => {
  const decision = aiStudyQuizGate.decide({
    ...baseContext,
    answer: "A\ninterface\nC",
    expectedAnswers: [["A", "type"], ["B", "interface"], ["C", ".ts", "ts"]],
  });

  assert.equal(decision.decision, "PASS");
  assert.equal(decision.host, "youtube.com");
});

test("AI study quiz gate asks follow-up for wrong or missing answers", () => {
  const decision = aiStudyQuizGate.decide({
    ...baseContext,
    answer: "A\nwrong",
    expectedAnswers: [["A", "type"], ["B", "interface"], ["C", ".ts", "ts"]],
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
