import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { confirmSubmissionScores, getSubmission, listQuestions, listSubmissionScores } from '../lib/api'
import { requiresTeacherReview } from '../lib/grading'
import { supabase } from '../supabaseClient'
import type { Question, Submission, SubmissionScore } from '../types'

interface Row {
  question: Question
  score: SubmissionScore | undefined
  currentValue: number
  confirmed: boolean
}

export function ReviewPage() {
  const { examId, submissionId } = useParams<{ examId: string; submissionId: string }>()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!examId || !submissionId) return
    Promise.all([getSubmission(submissionId), listQuestions(examId), listSubmissionScores(submissionId)])
      .then(([sub, questions, scores]) => {
        setSubmission(sub)
        setStudentName(sub.student_name ?? '')
        const built: Row[] = questions.map((q) => {
          const score = scores.find((s) => s.question_id === q.id)
          const confidence = score?.ai_confidence ?? 'low'
          const autoAccept = score?.ai_score != null && !requiresTeacherReview(q.type, confidence)
          return {
            question: q,
            score,
            currentValue: score?.final_score ?? score?.ai_score ?? 0,
            confirmed: autoAccept,
          }
        })
        setRows(built)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [examId, submissionId])

  function updateRow(questionId: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.question.id === questionId ? { ...r, ...patch } : r)))
  }

  const allConfirmed = rows.length > 0 && rows.every((r) => r.confirmed)
  const totalScore = rows.reduce((sum, r) => sum + r.currentValue, 0)
  const maxScore = rows.reduce((sum, r) => sum + r.question.max_points, 0)

  async function handleSave() {
    if (!submissionId || !allConfirmed) return
    setSaving(true)
    setError(null)
    try {
      if (studentName.trim() && studentName.trim() !== submission?.student_name) {
        await supabase.from('submissions').update({ student_name: studentName.trim() }).eq('id', submissionId)
      }
      await confirmSubmissionScores(
        submissionId,
        rows.map((r) => ({ questionId: r.question.id, finalScore: r.currentValue })),
      )
      navigate(`/exams/${examId}/results`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>
  if (!submission) return <p className="error-text">{error ?? 'Submission not found.'}</p>

  return (
    <div className="page">
      <h1>Review scores</h1>
      <label>
        Student name
        <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Detected from OCR" />
      </label>

      <p className="subtitle">
        Running total: {totalScore} / {maxScore}
      </p>

      <div className="question-list">
        {rows.map((row) => {
          const needsReview = !row.confirmed
          const ocrAnswer = submission.ocr_answers?.[String(row.question.question_number)] ?? '(no answer detected)'
          const noScoreYet = row.score?.ai_score == null
          return (
            <div className={`card ${needsReview ? 'card-flagged' : 'card-accepted'}`} key={row.question.id}>
              <div className="card-header">
                <strong>Q{row.question.question_number}</strong>
                {row.score?.ai_confidence && (
                  <span className={`badge badge-confidence-${row.score.ai_confidence}`}>
                    {row.score.ai_confidence} confidence
                  </span>
                )}
              </div>
              <p>{row.question.prompt}</p>
              <p className="ocr-answer">
                <em>Student wrote:</em> {ocrAnswer}
              </p>
              {row.score?.ai_note && <p className="ai-note">{row.score.ai_note}</p>}
              {noScoreYet && (
                <p className="error-text">AI grading unavailable — enter the score manually.</p>
              )}

              <div className="score-control">
                <button
                  type="button"
                  onClick={() => updateRow(row.question.id, { currentValue: Math.max(0, row.currentValue - 1) })}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={row.question.max_points}
                  value={row.currentValue}
                  onChange={(e) =>
                    updateRow(row.question.id, {
                      currentValue: Math.min(row.question.max_points, Math.max(0, Number(e.target.value))),
                    })
                  }
                />
                <span>/ {row.question.max_points}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateRow(row.question.id, {
                      currentValue: Math.min(row.question.max_points, row.currentValue + 1),
                    })
                  }
                >
                  +
                </button>
              </div>

              {row.confirmed ? (
                <p className="confirmed-tag">✓ Accepted</p>
              ) : (
                <button
                  type="button"
                  className="btn-primary btn-block"
                  onClick={() => updateRow(row.question.id, { confirmed: true })}
                >
                  Confirm this score
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary btn-block" disabled={!allConfirmed || saving} onClick={() => void handleSave()}>
        {saving ? 'Saving…' : allConfirmed ? 'Save final grade' : 'Confirm every flagged question to save'}
      </button>
    </div>
  )
}
