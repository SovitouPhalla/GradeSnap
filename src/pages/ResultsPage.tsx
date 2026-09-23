import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getExam, listQuestions, listScoresForSubmissions, listSubmissions } from '../lib/api'
import type { Exam, Question, Submission, SubmissionScore } from '../types'

export function ResultsPage() {
  const { examId } = useParams<{ examId: string }>()
  const [exam, setExam] = useState<Exam | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [scores, setScores] = useState<SubmissionScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    Promise.all([getExam(examId), listQuestions(examId), listSubmissions(examId)])
      .then(async ([e, q, subs]) => {
        setExam(e)
        setQuestions(q)
        const confirmed = subs.filter((s) => s.status === 'confirmed')
        setSubmissions(confirmed)
        setScores(await listScoresForSubmissions(confirmed.map((s) => s.id)))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [examId])

  const maxTotal = useMemo(() => questions.reduce((sum, q) => sum + q.max_points, 0), [questions])

  const studentTotals = useMemo(
    () =>
      submissions
        .map((sub) => {
          const subScores = scores.filter((sc) => sc.submission_id === sub.id)
          const total = subScores.reduce((sum, sc) => sum + (sc.final_score ?? 0), 0)
          return { submission: sub, total }
        })
        .sort((a, b) => b.total - a.total),
    [submissions, scores],
  )

  const classAverage = useMemo(() => {
    if (studentTotals.length === 0) return 0
    return studentTotals.reduce((sum, s) => sum + s.total, 0) / studentTotals.length
  }, [studentTotals])

  const pointLossByQuestion = useMemo(
    () =>
      questions
        .map((q) => {
          const qScores = scores.filter((sc) => sc.question_id === q.id)
          const lost = qScores.reduce((sum, sc) => sum + (q.max_points - (sc.final_score ?? 0)), 0)
          return { question: q, pointsLost: lost, responses: qScores.length }
        })
        .sort((a, b) => b.pointsLost - a.pointsLost),
    [questions, scores],
  )

  if (loading) return <div className="page-loading">Loading…</div>
  if (error) return <p className="error-text">{error}</p>
  if (!exam) return <p className="error-text">Exam not found.</p>

  return (
    <div className="page">
      <h1>{exam.title} — Results</h1>

      <div className="card">
        <p className="stat-big">
          {classAverage.toFixed(1)} / {maxTotal}
        </p>
        <p className="subtitle">Class average · {studentTotals.length} confirmed paper(s)</p>
      </div>

      <h2>Students</h2>
      <ul className="list">
        {studentTotals.map(({ submission, total }) => (
          <li key={submission.id} className="list-item">
            <span>{submission.student_name ?? 'Unnamed student'}</span>
            <span className="list-item-meta">
              {total} / {maxTotal}
            </span>
          </li>
        ))}
        {studentTotals.length === 0 && <p className="empty-state">No confirmed papers yet.</p>}
      </ul>

      <h2>Most point loss by question</h2>
      <ul className="list">
        {pointLossByQuestion.map(({ question, pointsLost, responses }) => (
          <li key={question.id} className="list-item">
            <span>
              Q{question.question_number}: {question.prompt}
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
