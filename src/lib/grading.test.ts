import { describe, expect, it } from 'vitest'
import type { Question } from '../types'
import {
  gradeMcqQuestion,
  normalizeMcqAnswer,
  parseShortAnswerGradingResponse,
  requiresTeacherReview,
} from './grading'

function mcqQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    exam_id: 'exam1',
    question_number: 1,
    type: 'mcq',
    prompt: 'What is 2 + 2?',
    options: [
      { label: 'A', text: '3' },
      { label: 'B', text: '4' },
      { label: 'C', text: '5' },
      { label: 'D', text: '6' },
    ],
    correct_option: 'B',
    rubric: null,
    max_points: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('normalizeMcqAnswer', () => {
  it('extracts a bare uppercase letter from noisy OCR text', () => {
    expect(normalizeMcqAnswer('b)')).toBe('B')
    expect(normalizeMcqAnswer(' (B) ')).toBe('B')
    expect(normalizeMcqAnswer('B.')).toBe('B')
    expect(normalizeMcqAnswer('  b  ')).toBe('B')
  })

  it('returns null for empty/missing input', () => {
    expect(normalizeMcqAnswer(null)).toBeNull()
    expect(normalizeMcqAnswer(undefined)).toBeNull()
    expect(normalizeMcqAnswer('')).toBeNull()
    expect(normalizeMcqAnswer('   ')).toBeNull()
  })
})

describe('gradeMcqQuestion', () => {
  it('awards full points for a correct match, case-insensitively', () => {
    const result = gradeMcqQuestion(mcqQuestion({ max_points: 2 }), 'b')
    expect(result.isCorrect).toBe(true)
    expect(result.score).toBe(2)
    expect(result.confidence).toBe('high')
  })

  it('awards zero points for an incorrect match', () => {
    const result = gradeMcqQuestion(mcqQuestion(), 'A')
    expect(result.isCorrect).toBe(false)
    expect(result.score).toBe(0)
  })

  it('handles messy OCR punctuation around the option letter', () => {
    const result = gradeMcqQuestion(mcqQuestion(), '(B)')
    expect(result.isCorrect).toBe(true)
  })

  it('treats a missing/blank OCR answer as incorrect, not a crash', () => {
    const result = gradeMcqQuestion(mcqQuestion(), null)
    expect(result.isCorrect).toBe(false)
    expect(result.score).toBe(0)
    expect(result.normalizedAnswer).toBeNull()
  })

  it('treats a missing answer key as unresolvable (never accidentally correct)', () => {
    const result = gradeMcqQuestion(mcqQuestion({ correct_option: null }), 'B')
    expect(result.isCorrect).toBe(false)
  })

  it('throws if called on a non-mcq question', () => {
    expect(() => gradeMcqQuestion(mcqQuestion({ type: 'short_answer' }), 'B')).toThrow()
  })
})

describe('parseShortAnswerGradingResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseShortAnswerGradingResponse(
      { score: 3, confidence: 'high', note: 'Covers the key points.' },
      5,
    )
    expect(result).toEqual({ score: 3, confidence: 'high', note: 'Covers the key points.' })
  })

  it('clamps a score above the max to the max', () => {
    const result = parseShortAnswerGradingResponse({ score: 10, confidence: 'low', note: 'Partial.' }, 4)
    expect(result.score).toBe(4)
  })

  it('clamps a negative score up to zero', () => {
    const result = parseShortAnswerGradingResponse({ score: -2, confidence: 'low', note: 'Off-topic.' }, 4)
    expect(result.score).toBe(0)
  })

  it('throws on a missing score', () => {
    expect(() => parseShortAnswerGradingResponse({ confidence: 'high', note: 'x' }, 5)).toThrow()
  })

  it('throws on an invalid confidence value', () => {
    expect(() =>
      parseShortAnswerGradingResponse({ score: 1, confidence: 'medium', note: 'x' }, 5),
    ).toThrow()
  })

  it('throws on a missing note', () => {
    expect(() => parseShortAnswerGradingResponse({ score: 1, confidence: 'high' }, 5)).toThrow()
  })

  it('throws on a non-object response', () => {
    expect(() => parseShortAnswerGradingResponse('nope', 5)).toThrow()
    expect(() => parseShortAnswerGradingResponse(null, 5)).toThrow()
  })
})

describe('requiresTeacherReview', () => {
  it('never auto-accepts short-answer questions, regardless of confidence', () => {
    expect(requiresTeacherReview('short_answer', 'high')).toBe(true)
    expect(requiresTeacherReview('short_answer', 'low')).toBe(true)
  })

  it('auto-accepts high-confidence MCQ results', () => {
    expect(requiresTeacherReview('mcq', 'high')).toBe(false)
  })

  it('flags low-confidence MCQ results', () => {
    expect(requiresTeacherReview('mcq', 'low')).toBe(true)
  })
})
