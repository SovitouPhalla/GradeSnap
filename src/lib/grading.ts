import type { Confidence, GradingResult } from '../types'

/**
 * Clamps and validates a raw LLM grading response against the question's max
 * point value. Throws if the shape is invalid so the caller can fall back to
 * manual entry instead of silently trusting a malformed AI response.
 */
export function parseGradingResponse(raw: unknown, maxPoints: number): GradingResult {
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

/**
 * Determines whether an AI-suggested score can be auto-accepted. There's no
 * answer key anymore (every question, MCQ or short-answer, is judged by the
 * model), so the only signal for auto-accepting is the model's own
 * confidence — low-confidence results always require a teacher's tap to
 * confirm or override before a paper can be saved.
 */
export function requiresTeacherReview(confidence: Confidence): boolean {
  return confidence === 'low'
}
