// Mirrors src/lib/grading.ts's MCQ logic (duplicated here because Supabase
// Edge Functions only bundle the supabase/functions directory).
export interface McqQuestionLike {
  correct_option: string | null
  max_points: number
}

export function normalizeMcqAnswer(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.trim().toUpperCase().match(/[A-Z0-9]+/)
  return match ? match[0] : null
}

export function gradeMcq(question: McqQuestionLike, ocrAnswer: string | null | undefined) {
  const normalizedAnswer = normalizeMcqAnswer(ocrAnswer)
  const correctOption = normalizeMcqAnswer(question.correct_option)
  const isCorrect = normalizedAnswer !== null && correctOption !== null && normalizedAnswer === correctOption
  return {
    isCorrect,
    score: isCorrect ? question.max_points : 0,
    normalizedAnswer,
  }
}
