import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CaptureCamera } from '../components/CaptureCamera'
import { processSubmission, uploadExamImage } from '../lib/api'
import { GeminiRateLimitError } from '../lib/geminiThrottle'

type Step = 'capture' | 'confirm' | 'uploading' | 'error'

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    // one retry for transient network errors on the upload step; the process-submission
    // edge function already retries its Gemini call once internally
    return await fn()
  }
}

export function ScanPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('capture')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])

  function handleCapture(blob: Blob) {
    setPhoto(blob)
    setStep('confirm')
  }

  async function handleSubmit() {
    if (!photo || !examId) return
    setStep('uploading')
    setError(null)
    try {
      setStatusMessage('Uploading photo…')
      const imagePath = await withRetry(() => uploadExamImage(examId, photo))

      setStatusMessage('Reading and grading the paper…')
      const { submissionId } = await processSubmission(examId, imagePath)

      navigate(`/exams/${examId}/submissions/${submissionId}/review`)
    } catch (e) {
      if (e instanceof GeminiRateLimitError) {
        setError(e.message)
      } else {
        setError(
          e instanceof Error
            ? `${e.message}. You can retake the photo, or continue and enter answers manually on the review screen.`
            : 'Something went wrong.',
        )
      }
      setStep('error')
    }
  }

  return (
    <div className="page">
      <h1>Scan paper</h1>

      {step === 'capture' && <CaptureCamera onCapture={handleCapture} />}

      {(step === 'confirm' || step === 'error') && photoUrl && (
        <>
          <img src={photoUrl} alt="Captured exam paper" className="photo-preview" />
          {error && <p className="error-text">{error}</p>}
          <div className="button-row">
            <button
              className="btn-secondary"
              onClick={() => {
                setPhoto(null)
                setError(null)
                setStep('capture')
              }}
            >
              Retake
            </button>
            <button className="btn-primary" onClick={() => void handleSubmit()}>
              {error ? 'Try again' : 'Use this photo'}
            </button>
          </div>
        </>
      )}

      {step === 'uploading' && (
        <div className="page-loading">
          <p>{statusMessage}</p>
        </div>
      )}
    </div>
  )
}
