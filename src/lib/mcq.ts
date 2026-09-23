export function normalizeOption(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function extractMcqOption(response: string | null | undefined) {
  const normalized = (response ?? "").trim().toUpperCase();
  const exact = normalized.match(/^([A-Z])(?:\b|$)/);

  if (exact) {
    return exact[1];
  }

  const bracketed = normalized.match(/[\[(]([A-Z])[\])]/);
  if (bracketed) {
    return bracketed[1];
  }

  const optionWord = normalized.match(/\bOPTION\s+([A-Z])\b/);
  return optionWord?.[1] ?? null;
}

export function clampScore(score: number, maxPoints: number) {
  return Math.max(0, Math.min(maxPoints, Number.isFinite(score) ? score : 0));
}

export function gradeMcqAnswer({
  correctOption,
  maxPoints,
  response,
}: {
  correctOption: string | null | undefined;
  maxPoints: number;
  response: string | null | undefined;
}) {
  const expected = normalizeOption(correctOption);
  const extracted = normalizeOption(extractMcqOption(response));
  const fallback = normalizeOption(response);

  if (!response?.trim()) {
    return {
      score: 0,
      confidence: "low" as const,
      note: "No answer was detected; teacher review is required.",
      autoAccepted: false,
      needsReview: true,
    };
  }

  if (extracted && expected) {
    const correct = extracted === expected;
    return {
      score: correct ? clampScore(maxPoints, maxPoints) : 0,
      confidence: "high" as const,
      note: correct
        ? `Matched option ${expected}.`
        : `Detected option ${extracted}, but the answer key expects ${expected}.`,
      autoAccepted: correct,
      needsReview: false,
    };
  }

  if (fallback && expected && fallback === expected) {
    return {
      score: clampScore(maxPoints, maxPoints),
      confidence: "high" as const,
      note: `Matched option ${expected}.`,
      autoAccepted: true,
      needsReview: false,
    };
  }

  return {
    score: 0,
    confidence: "low" as const,
    note: "The response was ambiguous, so the teacher should confirm the score.",
    autoAccepted: false,
    needsReview: true,
  };
}
