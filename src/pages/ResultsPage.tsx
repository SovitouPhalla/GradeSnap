import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getExam, listItemsForSubmissions, listSubmissions } from '../lib/api'
import type { Exam, Submission, SubmissionItem } from '../types'

export function ResultsPage() {
  const { examId } = useParams<{ examId: string }>()
  const [exam, setExam] = useState<Exam | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [items, setItems] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    Promise.all([getExam(examId), listSubmissions(examId)])
      .then(async ([e, subs]) => {
        setExam(e)
        const confirmed = subs.filter((s) => s.status === 'confirmed')
        setSubmissions(confirmed)
        setItems(await listItemsForSubmissions(confirmed.map((s) => s.id)))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [examId])

  const studentTotals = useMemo(
    () =>
      submissions
        .map((sub) => {
          const subItems = items.filter((it) => it.submission_id === sub.id)
          const total = subItems.reduce((sum, it) => sum + (it.final_score ?? 0), 0)
          const max = subItems.reduce((sum, it) => sum + it.max_points, 0)
          return { submission: sub, total, max }
        })
        .sort((a, b) => b.total - a.total),
    [submissions, items],
  )

  // Papers of the same printed exam should number questions the same way, so
  // averaging by question_number is a reasonable best-effort alignment even
  // without a shared, pre-defined question bank.
  const pointLossByQuestion = useMemo(() => {
    const byNumber = new Map<number, { prompt: string | null; pointsLost: number; responses: number }>()
    for (const it of items) {
      const entry = byNumber.get(it.question_number) ?? { prompt: it.prompt, pointsLost: 0, responses: 0 }
      entry.pointsLost += it.max_points - (it.final_score ?? 0)
      entry.responses += 1
      if (!entry.prompt && it.prompt) entry.prompt = it.prompt
      byNumber.set(it.question_number, entry)
    }
    return Array.from(byNumber.entries())
      .map(([questionNumber, v]) => ({ questionNumber, ...v }))
      .sort((a, b) => b.pointsLost - a.pointsLost)
  }, [items])

  const classAverage = useMemo(() => {
    if (studentTotals.length === 0) return 0
    return studentTotals.reduce((sum, s) => sum + s.total, 0) / studentTotals.length
  }, [studentTotals])

  const classMax = useMemo(() => {
    if (studentTotals.length === 0) return 0
    return studentTotals.reduce((sum, s) => sum + s.max, 0) / studentTotals.length
  }, [studentTotals])

  if (loading) return <div className="page-loading">Loading…</div>
  if (error) return <p className="error-text">{error}</p>
  if (!exam) return <p className="error-text">Exam not found.</p>

  return (
    <div className="page">
      <h1>{exam.title} — Results</h1>

      <div className="card">
        <p className="stat-big">
          {classAverage.toFixed(1)} / {classMax.toFixed(1)}
        </p>
        <p className="subtitle">Class average · {studentTotals.length} confirmed paper(s)</p>
      </div>

      <h2>Students</h2>
      <ul className="list">
        {studentTotals.map(({ submission, total, max }) => (
          <li key={submission.id} className="list-item">
            <span>{submission.student_name ?? 'Unnamed student'}</span>
            <span className="list-item-meta">
              {total} / {max}
            </span>
          </li>
        ))}
        {studentTotals.length === 0 && <p className="empty-state">No confirmed papers yet.</p>}
      </ul>

      <h2>Most point loss by question</h2>
      <ul className="list">
        {pointLossByQuestion.map(({ questionNumber, prompt, pointsLost, responses }) => (
          <li key={questionNumber} className="list-item">
            <span>
              Q{questionNumber}: {prompt ?? '(question text not detected)'}
            </span>
            <span className="list-item-meta">
              −{pointsLost} pts across {responses} paper(s)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
