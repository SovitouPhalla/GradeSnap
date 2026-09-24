import { describe, expect, it } from 'vitest'
import { parseGradingResponse, requiresTeacherReview } from './grading'

describe('parseGradingResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseGradingResponse({ score: 3, confidence: 'high', note: 'Covers the key points.' }, 5)
    expect(result).toEqual({ score: 3, confidence: 'high', note: 'Covers the key points.' })
  })

  it('clamps a score above the max to the max', () => {
    const result = parseGradingResponse({ score: 10, confidence: 'low', note: 'Partial.' }, 4)
    expect(result.score).toBe(4)
  })

  it('clamps a negative score up to zero', () => {
    const result = parseGradingResponse({ score: -2, confidence: 'low', note: 'Off-topic.' }, 4)
    expect(result.score).toBe(0)
  })

  it('throws on a missing score', () => {
    expect(() => parseGradingResponse({ confidence: 'high', note: 'x' }, 5)).toThrow()
  })

  it('throws on an invalid confidence value', () => {
    expect(() => parseGradingResponse({ score: 1, confidence: 'medium', note: 'x' }, 5)).toThrow()
  })

  it('throws on a missing note', () => {
    expect(() => parseGradingResponse({ score: 1, confidence: 'high' }, 5)).toThrow()
  })

  it('throws on a non-object response', () => {
    expect(() => parseGradingResponse('nope', 5)).toThrow()
    expect(() => parseGradingResponse(null, 5)).toThrow()
  })
})

describe('requiresTeacherReview', () => {
  it('auto-accepts high-confidence results', () => {
    expect(requiresTeacherReview('high')).toBe(false)
  })

  it('flags low-confidence results', () => {
    expect(requiresTeacherReview('low')).toBe(true)
  })
})
