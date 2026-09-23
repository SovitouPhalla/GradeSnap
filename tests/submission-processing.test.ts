import assert from "node:assert/strict";
import test from "node:test";
import { processSubmissionForReview, runOcrWithFallback } from "@/lib/submission";
import type { OCRResult, QuestionRecord } from "@/lib/types";

const questions: QuestionRecord[] = [
  {
    id: "q1",
    order_index: 1,
    prompt: "Pick the correct letter.",
    type: "mcq",
    correct_option: "A",
    rubric: null,
    max_points: 1,
  },
  {
    id: "q2",
    order_index: 2,
    prompt: "Name a planet.",
    type: "short_answer",
    correct_option: null,
    rubric: "Any valid planet name earns full credit.",
    max_points: 2,
  },
];

test("runOcrWithFallback returns the recovered OCR result on the retry", async () => {
  let attempts = 0;

  const result = await runOcrWithFallback({
    imageBase64: "fake-image",
    questionCount: 2,
    extractText: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary OCR failure");
      }

      return {
        studentName: "Ada Lovelace",
        rawText: "Ada Lovelace\n1. A\n2. Mars",
        answers: [
          { questionNumber: 1, response: "A" },
          { questionNumber: 2, response: "Mars" },
        ],
      };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.studentName, "Ada Lovelace");
  assert.equal(result.rawText, "Ada Lovelace\n1. A\n2. Mars");
  assert.deepEqual(result.answers.map((answer) => answer.response), ["A", "Mars"]);
});

test("processSubmissionForReview passes successful OCR output through to grading", async () => {
  const ocrResult: OCRResult = {
    studentName: "Grace Hopper",
    rawText: "Grace Hopper\n1. A",
    answers: [{ questionNumber: 1, response: "A" }],
  };
  let gradedOcr: OCRResult | null = null;

  const result = await processSubmissionForReview({
    imageBase64: "fake-image",
    questions: questions.slice(0, 1),
    extractText: async () => ocrResult,
    grade: async (_questions, nextOcrResult) => {
      gradedOcr = nextOcrResult;
      return [
        {
          questionId: "q1",
          questionNumber: 1,
          score: 1,
          confidence: "high",
          note: "Matched option A.",
          autoAccepted: true,
          needsReview: false,
          studentResponse: nextOcrResult.answers[0]?.response ?? "",
          questionType: "mcq",
          maxPoints: 1,
        },
      ];
    },
  });

  assert.equal(result.ocrResult.studentName, "Grace Hopper");
  assert.equal(gradedOcr, ocrResult);
  assert.equal(result.suggestions[0]?.studentResponse, "A");
});

test("processSubmissionForReview falls back to blank OCR answers after two OCR failures", async () => {
  let attempts = 0;

  const result = await processSubmissionForReview({
    imageBase64: "fake-image",
    questions,
    extractText: async () => {
      attempts += 1;
      throw new Error("ocr unavailable");
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.ocrResult.rawText, "");
  assert.deepEqual(
    result.ocrResult.answers.map((answer) => answer.response),
    ["", ""],
  );
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.suggestions[0].confidence, "low");
  assert.equal(result.suggestions[0].needsReview, true);
  assert.equal(result.suggestions[1].confidence, "low");
  assert.equal(result.suggestions[1].studentResponse, "");
  assert.match(result.suggestions[1].note, /teacher review|required|enter a score manually/i);
});
