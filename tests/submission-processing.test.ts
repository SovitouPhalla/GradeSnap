import assert from "node:assert/strict";
import test from "node:test";
import { processSubmissionForReview } from "@/lib/submission";
import type { QuestionRecord } from "@/lib/types";

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
