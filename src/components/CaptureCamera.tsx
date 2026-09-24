import { useEffect, useRef, useState } from 'react'

interface CaptureCameraProps {
  onCapture: (blob: Blob) => void
}

// Native camera photos can be 10+ MB at full sensor resolution, which is far
// more detail than OCR needs and risks hitting request-size limits on the
// Gemini API. Downscale to a reasonable max dimension before handing it off.
const MAX_DIMENSION = 1800

async function downscaleImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) {
    bitmap.close()
    return blob
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) => {
    canvas.toBlob((resized) => resolve(resized ?? blob), 'image/jpeg', 0.85)
  })
}

/**
 * Mobile camera capture. Prefers a live getUserMedia preview with a shutter
 * button; falls back to a native file input with capture="environment" for
 * browsers/environments where getUserMedia isn't available.
 */
export function CaptureCamera({ onCapture }: CaptureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('getUserMedia not supported; use the file picker below.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch (e) {
        setCameraError(e instanceof Error ? e.message : 'Could not access camera')
      }
    }
    void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function takePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => blob && void downscaleImage(blob).then(onCapture), 'image/jpeg', 0.9)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void downscaleImage(file).then(onCapture)
  }

  return (
    <div className="camera-capture">
      {cameraReady && !cameraError && (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
          <button type="button" className="btn-primary btn-block" onClick={takePhoto}>
            📷 Capture
          </button>
        </>
      )}
      {cameraError && <p className="error-text">{cameraError}</p>}
      <label className="btn-secondary btn-block file-input-label">
        {cameraReady ? 'Or choose a photo' : 'Take / choose a photo'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="visually-hidden"
        />
      </label>
    </div>
  )
}
