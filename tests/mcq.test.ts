import assert from "node:assert/strict";
import test from "node:test";
import { clampScore, gradeMcqAnswer } from "@/lib/mcq";

test("gradeMcqAnswer gives full credit for a matching option", () => {
  const result = gradeMcqAnswer({
    correctOption: "B",
    maxPoints: 2,
    response: "b",
  });

  assert.equal(result.score, 2);
  assert.equal(result.confidence, "high");
  assert.equal(result.autoAccepted, true);
  assert.equal(result.needsReview, false);
});

test("gradeMcqAnswer returns zero for a wrong but confidently detected option", () => {
  const result = gradeMcqAnswer({
    correctOption: "D",
    maxPoints: 1,
    response: "A",
  });

  assert.equal(result.score, 0);
  assert.equal(result.confidence, "high");
  assert.match(result.note, /expects D/);
});

test("gradeMcqAnswer falls back to low confidence for ambiguous OCR text", () => {
  const result = gradeMcqAnswer({
    correctOption: "C",
    maxPoints: 3,
    response: "student circled something between C and G",
  });

  assert.equal(result.score, 0);
  assert.equal(result.confidence, "low");
  assert.equal(result.needsReview, true);
});

test("clampScore keeps overridden scores inside the question range", () => {
  assert.equal(clampScore(-1, 4), 0);
  assert.equal(clampScore(7, 4), 4);
  assert.equal(clampScore(2, 4), 2);
});
