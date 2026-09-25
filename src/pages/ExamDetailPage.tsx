import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteExam, deleteSubmission, getExam, listSubmissions } from '../lib/api'
import type { Exam, Submission } from '../types'

const STATUS_LABEL: Record<Submission['status'], string> = {
  pending: 'Pending',
  graded: 'Needs review',
  confirmed: 'Confirmed',
  error: 'Error',
}

export function ExamDetailPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [exam, setExam] = useState<Exam | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [deletingExam, setDeletingExam] = useState(false)

  useEffect(() => {
    if (!examId) return
    Promise.all([getExam(examId), listSubmissions(examId)])
      .then(([e, s]) => {
        setExam(e)
        setSubmissions(s)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [examId])

  async function handleDeleteSubmission(submission: Submission) {
    if (!confirm(`Delete this paper (${submission.student_name ?? 'Unnamed student'})? This can't be undone.`)) return
    setDeletingSubmissionId(submission.id)
    setError(null)
    try {
      await deleteSubmission(submission.id)
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete paper')
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  async function handleDeleteExam() {
    if (!exam) return
    if (!confirm(`Delete "${exam.title}" and all its scanned papers? This can't be undone.`)) return
    setDeletingExam(true)
    setError(null)
    try {
      await deleteExam(exam.id)
      navigate('/exams')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete exam')
      setDeletingExam(false)
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>
  if (error) return <p className="error-text">{error}</p>
  if (!exam || !examId) return <p className="error-text">Exam not found.</p>

  return (
    <div className="page">
      <header className="page-header">
        <h1>{exam.title}</h1>
        <button type="button" className="btn-link btn-link-danger" disabled={deletingExam} onClick={() => void handleDeleteExam()}>
          {deletingExam ? 'Deleting…' : 'Delete exam'}
        </button>
      </header>

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
          <li key={s.id} className="list-item">
            <Link
              to={
                s.status === 'confirmed'
                  ? `/exams/${examId}/results`
                  : `/exams/${examId}/submissions/${s.id}/review`
              }
              className="list-item-link"
            >
              <span>{s.student_name ?? 'Unnamed student'}</span>
              <span className={`badge badge-${s.status}`}>{STATUS_LABEL[s.status]}</span>
            </Link>
            <button
              type="button"
              className="btn-link btn-link-danger"
              disabled={deletingSubmissionId === s.id}
              onClick={() => void handleDeleteSubmission(s)}
            >
              {deletingSubmissionId === s.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
        {submissions.length === 0 && <p className="empty-state">No papers scanned yet.</p>}
      </ul>
    </div>
  )
}
