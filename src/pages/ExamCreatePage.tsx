import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createExam, createQuestions, type NewQuestion } from '../lib/api'
import type { McqOption, QuestionType } from '../types'

interface DraftQuestion {
  type: QuestionType
  prompt: string
  options: McqOption[]
  correctOption: string
  rubric: string
  maxPoints: number
}

function emptyMcq(): DraftQuestion {
  return {
    type: 'mcq',
    prompt: '',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
      { label: 'C', text: '' },
      { label: 'D', text: '' },
    ],
    correctOption: 'A',
    rubric: '',
    maxPoints: 1,
  }
}

function emptyShortAnswer(): DraftQuestion {
  return { type: 'short_answer', prompt: '', options: [], correctOption: '', rubric: '', maxPoints: 5 }
}

export function ExamCreatePage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyMcq()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function updateOption(index: number, optionIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === index
          ? { ...q, options: q.options.map((o, oi) => (oi === optionIndex ? { ...o, text } : o)) }
          : q,
      ),
    )
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) {
      setError('Give the exam a title.')
      return
    }
    if (questions.length === 0) {
      setError('Add at least one question.')
      return
    }
    for (const q of questions) {
      if (!q.prompt.trim()) {
        setError('Every question needs a prompt.')
        return
      }
      if (q.type === 'short_answer' && !q.rubric.trim()) {
        setError('Every short-answer question needs a rubric / model answer.')
        return
      }
    }

    setSaving(true)
    try {
      const exam = await createExam(title.trim())
      const payload: NewQuestion[] = questions.map((q, i) => ({
        question_number: i + 1,
        type: q.type,
        prompt: q.prompt.trim(),
        options: q.type === 'mcq' ? q.options : null,
        correct_option: q.type === 'mcq' ? q.correctOption : null,
        rubric: q.type === 'short_answer' ? q.rubric.trim() : null,
        max_points: q.maxPoints,
      }))
      await createQuestions(exam.id, payload)
      navigate(`/exams/${exam.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save exam')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <h1>New exam</h1>
      <label>
        Exam title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unit 3 Quiz" />
      </label>

      <div className="question-list">
        {questions.map((q, index) => (
          <div className="card" key={index}>
            <div className="card-header">
              <strong>Question {index + 1}</strong>
              <button type="button" className="btn-link" onClick={() => removeQuestion(index)}>
                Remove
              </button>
            </div>

            <label>
              Type
              <select
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionType
                  updateQuestion(index, type === 'mcq' ? { ...emptyMcq() } : { ...emptyShortAnswer() })
                }}
              >
                <option value="mcq">Multiple choice</option>
                <option value="short_answer">Short answer</option>
              </select>
            </label>

            <label>
              Prompt
              <textarea
                value={q.prompt}
                onChange={(e) => updateQuestion(index, { prompt: e.target.value })}
                rows={2}
              />
            </label>

            {q.type === 'mcq' ? (
              <>
                {q.options.map((opt, oi) => (
                  <label key={opt.label}>
                    Option {opt.label}
                    <input value={opt.text} onChange={(e) => updateOption(index, oi, e.target.value)} />
                  </label>
                ))}
                <label>
                  Correct option
                  <select
                    value={q.correctOption}
                    onChange={(e) => updateQuestion(index, { correctOption: e.target.value })}
                  >
                    {q.options.map((opt) => (
                      <option key={opt.label} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Points
                  <input
                    type="number"
                    min={0}
                    value={q.maxPoints}
                    onChange={(e) => updateQuestion(index, { maxPoints: Number(e.target.value) })}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Rubric / model answer
                  <textarea
                    value={q.rubric}
                    onChange={(e) => updateQuestion(index, { rubric: e.target.value })}
                    rows={2}
                    placeholder="1-2 sentences describing what a full-credit answer includes"
                  />
                </label>
                <label>
                  Max points
                  <input
                    type="number"
                    min={0}
                    value={q.maxPoints}
                    onChange={(e) => updateQuestion(index, { maxPoints: Number(e.target.value) })}
                  />
                </label>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="button-row">
        <button type="button" className="btn-secondary" onClick={() => setQuestions((qs) => [...qs, emptyMcq()])}>
          + MCQ question
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setQuestions((qs) => [...qs, emptyShortAnswer()])}
        >
          + Short-answer question
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary btn-block" onClick={() => void handleSubmit()} disabled={saving}>
        {saving ? 'Saving…' : 'Save exam'}
      </button>
    </div>
  )
}
