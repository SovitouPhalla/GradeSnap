import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const action = mode === 'signin' ? signIn : signUp
    const { error: authError } = await action(email, password)
    setSubmitting(false)
    if (authError) {
      setError(authError)
      return
    }
    if (mode === 'signup') {
      setError('Account created. Check your email if confirmation is required, then sign in.')
      setMode('signin')
      return
    }
    navigate('/exams')
  }

  return (
    <div className="page auth-page">
      <h1>GradeSnap</h1>
      <p className="subtitle">Photograph exams. AI grades a first pass. You confirm every score.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          setError(null)
          setMode(mode === 'signin' ? 'signup' : 'signin')
        }}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
