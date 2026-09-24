import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { confirmSubmissionItems, getSubmission, listSubmissionItems } from '../lib/api'
import { requiresTeacherReview } from '../lib/grading'
import { supabase } from '../supabaseClient'
import type { Submission, SubmissionItem } from '../types'

interface Row {
  item: SubmissionItem
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
    if (!submissionId) return
    Promise.all([getSubmission(submissionId), listSubmissionItems(submissionId)])
      .then(([sub, items]) => {
        setSubmission(sub)
        setStudentName(sub.student_name ?? '')
        const built: Row[] = items.map((item) => {
          const confidence = item.ai_confidence ?? 'low'
          const autoAccept = item.ai_score != null && !requiresTeacherReview(confidence)
          return {
            item,
            currentValue: item.final_score ?? item.ai_score ?? 0,
            confirmed: autoAccept,
          }
        })
        setRows(built)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [submissionId])

  function updateRow(itemId: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.item.id === itemId ? { ...r, ...patch } : r)))
  }

  const allConfirmed = rows.length > 0 && rows.every((r) => r.confirmed)
  const totalScore = rows.reduce((sum, r) => sum + r.currentValue, 0)
  const maxScore = rows.reduce((sum, r) => sum + r.item.max_points, 0)

  async function handleSave() {
    if (!submissionId || !allConfirmed) return
    setSaving(true)
    setError(null)
    try {
      if (studentName.trim() && studentName.trim() !== submission?.student_name) {
        await supabase.from('submissions').update({ student_name: studentName.trim() }).eq('id', submissionId)
      }
      await confirmSubmissionItems(
        submissionId,
        rows.map((r) => ({ itemId: r.item.id, finalScore: r.currentValue })),
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

  if (rows.length === 0) {
    return (
      <div className="page">
        <h1>Review scores</h1>
        <p className="error-text">
          The AI couldn't read any questions on this paper. Retake the photo — make sure the page is well-lit,
          in focus, and fully in frame.
        </p>
        <button className="btn-primary btn-block" onClick={() => navigate(`/exams/${examId}/scan`)}>
          Retake photo
        </button>
      </div>
    )
  }

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
          const noScoreYet = row.item.ai_score == null
          return (
            <div className={`card ${needsReview ? 'card-flagged' : 'card-accepted'}`} key={row.item.id}>
              <div className="card-header">
                <strong>Q{row.item.question_number}</strong>
                {row.item.ai_confidence && (
                  <span className={`badge badge-confidence-${row.item.ai_confidence}`}>
                    {row.item.ai_confidence} confidence
                  </span>
                )}
              </div>
              <p>{row.item.prompt ?? '(question text not detected)'}</p>
              <p className="ocr-answer">
                <em>Student wrote:</em> {row.item.extracted_answer ?? '(no answer detected)'}
              </p>
              {row.item.ai_note && <p className="ai-note">{row.item.ai_note}</p>}
              {noScoreYet && (
                <p className="error-text">AI grading unavailable — enter the score manually.</p>
              )}

              <div className="score-control">
                <button
                  type="button"
                  onClick={() => updateRow(row.item.id, { currentValue: Math.max(0, row.currentValue - 1) })}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={row.item.max_points}
                  value={row.currentValue}
                  onChange={(e) =>
                    updateRow(row.item.id, {
                      currentValue: Math.min(row.item.max_points, Math.max(0, Number(e.target.value))),
                    })
                  }
                />
                <span>/ {row.item.max_points}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateRow(row.item.id, {
                      currentValue: Math.min(row.item.max_points, row.currentValue + 1),
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
                  onClick={() => updateRow(row.item.id, { confirmed: true })}
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
