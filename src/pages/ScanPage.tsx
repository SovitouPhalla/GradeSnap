import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CaptureCamera } from '../components/CaptureCamera'
import { ImageCropper } from '../components/ImageCropper'
import { processSubmission, uploadExamImage } from '../lib/api'
import { GeminiRateLimitError } from '../lib/geminiThrottle'

type Step = 'capture' | 'crop' | 'pages' | 'uploading' | 'error'

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
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null)
  const [pages, setPages] = useState<Blob[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pendingPhotoUrl = useMemo(() => (pendingPhoto ? URL.createObjectURL(pendingPhoto) : null), [pendingPhoto])
  const pageUrls = useMemo(() => pages.map((p) => URL.createObjectURL(p)), [pages])

  function handleCapture(blob: Blob) {
    setPendingPhoto(blob)
    setStep('crop')
  }

  function addPage(blob: Blob) {
    setPages((p) => [...p, blob])
    setPendingPhoto(null)
    setStep('pages')
  }

  function removePage(index: number) {
    setPages((p) => p.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (pages.length === 0 || !examId) return
    setStep('uploading')
    setError(null)
    try {
      setStatusMessage(pages.length > 1 ? `Uploading ${pages.length} pages…` : 'Uploading photo…')
      const imagePaths: string[] = []
      for (const page of pages) {
        imagePaths.push(await withRetry(() => uploadExamImage(examId, page)))
      }

      setStatusMessage('Reading and grading the paper…')
      const { submissionId } = await processSubmission(examId, imagePaths)

      navigate(`/exams/${examId}/submissions/${submissionId}/review`)
    } catch (e) {
      if (e instanceof GeminiRateLimitError) {
        setError(e.message)
      } else {
        setError(
          e instanceof Error
            ? `${e.message}. You can retake the photos, or continue and enter answers manually on the review screen.`
            : 'Something went wrong.',
        )
      }
      setStep('error')
    }
  }

  return (
    <div className="page">
      <h1>Scan paper</h1>

      {step === 'capture' && (
        <>
          {pages.length > 0 && <p className="subtitle">{pages.length} page(s) added so far.</p>}
          <CaptureCamera onCapture={handleCapture} />
          {pages.length > 0 && (
            <button type="button" className="btn-secondary btn-block" onClick={() => setStep('pages')}>
              Back to pages
            </button>
          )}
        </>
      )}

      {step === 'crop' && pendingPhotoUrl && (
        <ImageCropper
          imageUrl={pendingPhotoUrl}
          onDone={addPage}
          onSkip={() => pendingPhoto && addPage(pendingPhoto)}
        />
      )}

      {step === 'pages' && (
        <>
          <p className="subtitle">
            {pages.length} page{pages.length === 1 ? '' : 's'} for this paper. Add more if it's multi-page, or submit
            when done.
          </p>
          <div className="page-thumbs">
            {pageUrls.map((url, i) => (
              <div className="page-thumb" key={url}>
                <img src={url} alt={`Page ${i + 1}`} />
                <span className="page-thumb-number">{i + 1}</span>
                <button
                  type="button"
                  className="page-thumb-remove"
                  onClick={() => removePage(i)}
                  aria-label={`Remove page ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="button-row">
            <button type="button" className="btn-secondary" onClick={() => setStep('capture')}>
              + Add page
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pages.length === 0}
              onClick={() => void handleSubmit()}
            >
              Submit paper
            </button>
          </div>
        </>
      )}

      {step === 'error' && (
        <>
          <div className="page-thumbs">
            {pageUrls.map((url, i) => (
              <div className="page-thumb" key={url}>
                <img src={url} alt={`Page ${i + 1}`} />
                <span className="page-thumb-number">{i + 1}</span>
              </div>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="button-row">
            <button type="button" className="btn-secondary" onClick={() => setStep('pages')}>
              Back to pages
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSubmit()}>
              Try again
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
