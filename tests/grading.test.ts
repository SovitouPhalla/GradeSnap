import assert from "node:assert/strict";
import test from "node:test";
import { gradeSubmission } from "@/lib/grading";
import type { QuestionRecord } from "@/lib/types";

const shortAnswerQuestion: QuestionRecord = {
  id: "q-short",
  order_index: 1,
  prompt: "Explain evaporation.",
  type: "short_answer",
  correct_option: null,
  rubric: "Water changes from liquid to vapor because of heat.",
  max_points: 2,
};

test("gradeSubmission returns a manual-review suggestion when short-answer grading fails twice", async () => {
  const result = await gradeSubmission(
    [shortAnswerQuestion],
    {
      studentName: "Student",
      rawText: "1. Water turns into vapor",
      answers: [{ questionNumber: 1, response: "Water turns into vapor" }],
    },
    {
      shortAnswerGrader: async () => {
        throw new Error("anthropic unavailable");
      },
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.confidence, "low");
  assert.equal(result[0]?.needsReview, true);
  assert.equal(result[0]?.score, 0);
  assert.match(result[0]?.note ?? "", /unavailable|manual/i);
});
