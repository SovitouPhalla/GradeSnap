import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { deleteExam, listExams } from '../lib/api'
import type { Exam } from '../types'

export function ExamsListPage() {
  const { signOut, user } = useAuth()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    listExams()
      .then(setExams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(exam: Exam) {
    if (!confirm(`Delete "${exam.title}" and all its scanned papers? This can't be undone.`)) return
    setDeletingId(exam.id)
    setError(null)
    try {
      await deleteExam(exam.id)
      setExams((prev) => prev.filter((e) => e.id !== exam.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete exam')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand-row">
          <img src="/pwa-192x192.png" alt="" className="brand-icon" />
          <div>
            <h1>Your exams</h1>
            <p className="subtitle">{user?.email}</p>
          </div>
        </div>
        <button className="btn-link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <Link to="/exams/new" className="btn-primary btn-block">
        + New exam
      </Link>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      <ul className="list">
        {exams.map((exam) => (
          <li key={exam.id} className="list-item">
            <Link to={`/exams/${exam.id}`} className="list-item-link">
              <span>{exam.title}</span>
              <span className="list-item-meta">{new Date(exam.created_at).toLocaleDateString()}</span>
            </Link>
            <button
              type="button"
              className="btn-link btn-link-danger"
              disabled={deletingId === exam.id}
              onClick={() => void handleDelete(exam)}
            >
              {deletingId === exam.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
        {!loading && exams.length === 0 && <p className="empty-state">No exams yet. Create one to get started.</p>}
      </ul>
    </div>
  )
}
