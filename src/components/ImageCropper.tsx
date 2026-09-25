import { useRef, useState } from 'react'

interface ImageCropperProps {
  imageUrl: string
  onDone: (blob: Blob) => void
  onSkip: () => void
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_SIZE = 40

function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
  const width = Math.max(MIN_SIZE, Math.min(rect.width, bounds.width))
  const height = Math.max(MIN_SIZE, Math.min(rect.height, bounds.height))
  const x = Math.max(0, Math.min(rect.x, bounds.width - width))
  const y = Math.max(0, Math.min(rect.y, bounds.height - height))
  return { x, y, width, height }
}

/** Lets the teacher drag a crop box over a captured photo before it's uploaded. */
export function ImageCropper({ imageUrl, onDone, onSkip }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startRect: Rect } | null>(null)

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const w = img.clientWidth
    const h = img.clientHeight
    setRect({ x: w * 0.05, y: h * 0.05, width: w * 0.9, height: h * 0.9 })
  }

  function beginDrag(mode: DragMode) {
    return (e: React.PointerEvent) => {
      if (!rect) return
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const img = imgRef.current
    if (!drag || !img) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const bounds = { width: img.clientWidth, height: img.clientHeight }
    const next = { ...drag.startRect }

    if (drag.mode === 'move') {
      next.x = drag.startRect.x + dx
      next.y = drag.startRect.y + dy
    } else {
      if (drag.mode.includes('n')) {
        next.y = drag.startRect.y + dy
        next.height = drag.startRect.height - dy
      }
      if (drag.mode.includes('s')) {
        next.height = drag.startRect.height + dy
      }
      if (drag.mode.includes('w')) {
        next.x = drag.startRect.x + dx
        next.width = drag.startRect.width - dx
      }
      if (drag.mode.includes('e')) {
        next.width = drag.startRect.width + dx
      }
    }
    setRect(clampRect(next, bounds))
  }

  function endDrag() {
    dragRef.current = null
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img || !rect) return
    const scaleX = img.naturalWidth / img.clientWidth
    const scaleY = img.naturalHeight / img.clientHeight
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(rect.width * scaleX)
    canvas.height = Math.round(rect.height * scaleY)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(
      img,
      rect.x * scaleX,
      rect.y * scaleY,
      rect.width * scaleX,
      rect.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    canvas.toBlob((blob) => blob && onDone(blob), 'image/jpeg', 0.9)
  }

  return (
    <div className="cropper">
      <p className="subtitle">Drag the corners to crop out anything that isn't this page.</p>
      <div className="cropper-image-wrap" onPointerMove={handlePointerMove} onPointerUp={endDrag}>
        <img
          ref={imgRef}
          src={imageUrl}
          onLoad={handleImageLoad}
          className="cropper-image"
          alt="Captured page to crop"
          draggable={false}
        />
        {rect && (
          <div
            className="crop-rect"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={beginDrag('move')}
          >
            <div className="crop-handle crop-handle-nw" onPointerDown={beginDrag('nw')} />
            <div className="crop-handle crop-handle-ne" onPointerDown={beginDrag('ne')} />
            <div className="crop-handle crop-handle-sw" onPointerDown={beginDrag('sw')} />
            <div className="crop-handle crop-handle-se" onPointerDown={beginDrag('se')} />
          </div>
        )}
      </div>
      <div className="button-row">
        <button type="button" className="btn-secondary" onClick={onSkip}>
          Skip crop
        </button>
        <button type="button" className="btn-primary" onClick={handleConfirm}>
          Use crop
        </button>
      </div>
    </div>
  )
}
