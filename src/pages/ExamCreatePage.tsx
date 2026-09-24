import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createExam } from '../lib/api'

export function ExamCreatePage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) {
      setError('Give the exam a title.')
      return
    }
    setSaving(true)
    try {
      const exam = await createExam(title.trim())
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
      <p className="subtitle">
        Just name it — the AI reads the questions and answers straight off each photographed paper, no
        setup required.
      </p>
      <label>
        Exam title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unit 3 Quiz" />
      </label>

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary btn-block" onClick={() => void handleSubmit()} disabled={saving}>
        {saving ? 'Saving…' : 'Create exam'}
      </button>
    </div>
  )
}
