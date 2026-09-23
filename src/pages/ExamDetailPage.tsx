import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getExam, listQuestions, listSubmissions } from '../lib/api'
import type { Exam, Question, Submission } from '../types'

const STATUS_LABEL: Record<Submission['status'], string> = {
  pending: 'Pending',
  graded: 'Needs review',
  confirmed: 'Confirmed',
  error: 'Error',
}

export function ExamDetailPage() {
  const { examId } = useParams<{ examId: string }>()
  const [exam, setExam] = useState<Exam | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    Promise.all([getExam(examId), listQuestions(examId), listSubmissions(examId)])
      .then(([e, q, s]) => {
        setExam(e)
        setQuestions(q)
        setSubmissions(s)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [examId])

  if (loading) return <div className="page-loading">Loading…</div>
  if (error) return <p className="error-text">{error}</p>
  if (!exam || !examId) return <p className="error-text">Exam not found.</p>

  return (
    <div className="page">
      <h1>{exam.title}</h1>
      <p className="subtitle">{questions.length} question(s)</p>

      <div className="button-row">
        <Link to={`/exams/${examId}/scan`} className="btn-primary">
          📷 Scan a paper
        </Link>
        <Link to={`/exams/${examId}/results`} className="btn-secondary">
          View results
        </Link>
      </div>

      <h2>Submissions</h2>
      <ul className="list">
        {submissions.map((s) => (
          <li key={s.id}>
            <Link
              to={
                s.status === 'confirmed'
                  ? `/exams/${examId}/results`
                  : `/exams/${examId}/submissions/${s.id}/review`
              }
              className="list-item"
            >
              <span>{s.student_name ?? 'Unnamed student'}</span>
              <span className={`badge badge-${s.status}`}>{STATUS_LABEL[s.status]}</span>
            </Link>
          </li>
        ))}
        {submissions.length === 0 && <p className="empty-state">No papers scanned yet.</p>}
      </ul>
    </div>
  )
}
