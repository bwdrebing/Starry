import { useEffect, useRef, useCallback } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'

const PALETTE = {
  3:  ['rgba(255,107, 87,0.2)', 'rgba(255,107, 87,0.9)'],
  4:  ['rgba( 72,149,239,0.2)', 'rgba( 72,149,239,0.9)'],
  6:  ['rgba(167, 86,255,0.2)', 'rgba(167, 86,255,0.9)'],
  8:  ['rgba( 67,210,163,0.2)', 'rgba( 67,210,163,0.9)'],
  12: ['rgba(255,200, 55,0.2)', 'rgba(255,200, 55,0.9)'],
}
const DEFAULT_COLOR = ['rgba(200,200,255,0.2)', 'rgba(200,200,255,0.8)']

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function touchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

export default function AntwerpCanvas({ configuration, shapeSize = 48 }) {
  const canvasRef = useRef(null)
  const shapesRef = useRef([])
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const gestureRef = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const { x, y, scale } = transformRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2 + x, H / 2 + y)
    ctx.scale(scale, scale)

    for (const shape of shapesRef.current) {
      const vertices = shape[0]
      if (!vertices || vertices.length < 3) continue
      const [fill, stroke] = PALETTE[vertices.length] ?? DEFAULT_COLOR

      ctx.beginPath()
      ctx.moveTo(vertices[0][0], vertices[0][1])
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i][0], vertices[i][1])
      }
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1 / scale
      ctx.stroke()
    }

    ctx.restore()
  }, [])

  // Recompute shapes and reset view when configuration changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !configuration) return

    const rect = canvas.getBoundingClientRect()
    const W = rect.width || 600
    const H = rect.height || 500
    canvas.width = W
    canvas.height = H

    try {
      const data = toShapes({ configuration, width: W, height: H, shapeSize })
      shapesRef.current = data?.shapes ?? []
    } catch (err) {
      console.error('Failed to generate tiling:', err)
      shapesRef.current = []
    }

    transformRef.current = { x: 0, y: 0, scale: 1 }
    draw()
  }, [configuration, shapeSize, draw])

  // Touch and wheel interaction
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onTouchStart(e) {
      e.preventDefault()
      if (e.touches.length === 1) {
        gestureRef.current = {
          type: 'pan',
          startX: e.touches[0].clientX - transformRef.current.x,
          startY: e.touches[0].clientY - transformRef.current.y,
        }
      } else if (e.touches.length === 2) {
        gestureRef.current = {
          type: 'pinch',
          startDist: touchDist(e.touches),
          startScale: transformRef.current.scale,
          startCenter: touchCenter(e.touches),
          startPan: { x: transformRef.current.x, y: transformRef.current.y },
        }
      }
    }

    function onTouchMove(e) {
      e.preventDefault()
      const g = gestureRef.current
      if (!g) return

      if (g.type === 'pan' && e.touches.length === 1) {
        transformRef.current.x = e.touches[0].clientX - g.startX
        transformRef.current.y = e.touches[0].clientY - g.startY
        draw()
      } else if (g.type === 'pinch' && e.touches.length === 2) {
        const scale = Math.max(0.2, Math.min(10, g.startScale * (touchDist(e.touches) / g.startDist)))
        const center = touchCenter(e.touches)
        transformRef.current = {
          scale,
          x: g.startPan.x + (center.x - g.startCenter.x),
          y: g.startPan.y + (center.y - g.startCenter.y),
        }
        draw()
      }
    }

    function onTouchEnd() {
      gestureRef.current = null
    }

    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      transformRef.current.scale = Math.max(0.2, Math.min(10, transformRef.current.scale * factor))
      draw()
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
  )
}
