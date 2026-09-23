import type { Question, ShortAnswerGradingResult } from '../types'

/**
 * Normalizes a raw OCR'd MCQ answer (e.g. "b)", " B ", "(B)") down to a bare
 * uppercase option letter/label for comparison against the answer key.
 */
export function normalizeMcqAnswer(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.trim().toUpperCase().match(/[A-Z0-9]+/)
  return match ? match[0] : null
}

export interface McqGradeResult {
  isCorrect: boolean
  /** MCQ grading is deterministic string-compare, so confidence is always "high". */
  confidence: 'high'
  score: number
  normalizedAnswer: string | null
}

/**
 * Grades a single MCQ question by directly comparing the OCR'd student
 * selection to the answer key. No LLM call is involved.
 */
export function gradeMcqQuestion(question: Question, ocrAnswer: string | null | undefined): McqGradeResult {
  if (question.type !== 'mcq') {
    throw new Error(`gradeMcqQuestion called with non-mcq question ${question.id}`)
  }
  const normalizedAnswer = normalizeMcqAnswer(ocrAnswer)
  const correctOption = normalizeMcqAnswer(question.correct_option)
  const isCorrect = normalizedAnswer !== null && correctOption !== null && normalizedAnswer === correctOption
  return {
    isCorrect,
    confidence: 'high',
    score: isCorrect ? question.max_points : 0,
    normalizedAnswer,
  }
}

/**
 * Clamps and validates a raw LLM grading response against the question's max
 * point value. Throws if the shape is invalid so the caller can fall back to
 * manual entry instead of silently trusting a malformed AI response.
 */
export function parseShortAnswerGradingResponse(
  raw: unknown,
  maxPoints: number,
): ShortAnswerGradingResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Grading response was not a JSON object')
  }
  const { score, confidence, note } = raw as Record<string, unknown>
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new Error('Grading response missing numeric "score"')
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Grading response missing "confidence" of "high" | "low"')
  }
  if (typeof note !== 'string' || note.length === 0) {
    throw new Error('Grading response missing "note"')
  }
  const clampedScore = Math.min(Math.max(score, 0), maxPoints)
  return { score: clampedScore, confidence, note }
}

export interface FlaggedQuestionResult {
  questionId: string
  questionNumber: number
  score: number
  confidence: 'high' | 'low'
  note: string | null
  /** Every short-answer question and every low-confidence result must be reviewed. */
  requiresReview: boolean
}

/**
 * Determines whether an AI-suggested score can be auto-accepted, per the
 * review rules: only high-confidence MCQ matches auto-accept. Everything
 * else (all short-answer questions, and any low-confidence result) is
 * flagged for mandatory teacher review.
 */
export function requiresTeacherReview(questionType: Question['type'], confidence: 'high' | 'low'): boolean {
  if (questionType === 'short_answer') return true
  return confidence === 'low'
}
