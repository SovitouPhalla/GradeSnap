import assert from "node:assert/strict";
import test from "node:test";
import { confirmSubmissionReview } from "@/lib/confirm-submission";

test("confirmSubmissionReview returns success for a confirmed paper", async () => {
  const result = await confirmSubmissionReview({
    supabase: {
      rpc: async () => ({ data: 4, error: null }),
    },
    teacherId: "teacher-1",
    submissionId: "submission-1",
    payload: {
      studentName: "Ada",
      answers: [{ id: "a1", studentResponse: "A", finalScore: 1, reviewed: true }],
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.totalFinalScore, 4);
  }
});

test("confirmSubmissionReview returns a 400 when a flagged answer remains unreviewed", async () => {
  const result = await confirmSubmissionReview({
    supabase: {
      rpc: async () => ({
        data: null,
        error: { message: "Every flagged answer must be reviewed before confirmation." },
      }),
    },
    teacherId: "teacher-1",
    submissionId: "submission-1",
    payload: {
      studentName: "Ada",
      answers: [{ id: "a1", studentResponse: "A", finalScore: 1, reviewed: false }],
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.message, /reviewed/i);
  }
});
