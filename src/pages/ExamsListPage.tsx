import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listExams } from '../lib/api'
import type { Exam } from '../types'

export function ExamsListPage() {
  const { signOut, user } = useAuth()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listExams()
      .then(setExams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Your exams</h1>
          <p className="subtitle">{user?.email}</p>
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
          <li key={exam.id}>
            <Link to={`/exams/${exam.id}`} className="list-item">
              <span>{exam.title}</span>
              <span className="list-item-meta">{new Date(exam.created_at).toLocaleDateString()}</span>
            </Link>
          </li>
        ))}
        {!loading && exams.length === 0 && <p className="empty-state">No exams yet. Create one to get started.</p>}
      </ul>
    </div>
  )
}
