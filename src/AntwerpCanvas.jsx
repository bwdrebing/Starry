import { useEffect, useRef } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'

const PALETTE = {
  3:  ['rgba(255,107, 87,0.2)', 'rgba(255,107, 87,0.9)'],
  4:  ['rgba( 72,149,239,0.2)', 'rgba( 72,149,239,0.9)'],
  6:  ['rgba(167, 86,255,0.2)', 'rgba(167, 86,255,0.9)'],
  8:  ['rgba( 67,210,163,0.2)', 'rgba( 67,210,163,0.9)'],
  12: ['rgba(255,200, 55,0.2)', 'rgba(255,200, 55,0.9)'],
}
const DEFAULT_COLOR = ['rgba(200,200,255,0.2)', 'rgba(200,200,255,0.8)']

export default function AntwerpCanvas({ configuration, shapeSize = 48 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !configuration) return

    const rect = canvas.getBoundingClientRect()
    const W = rect.width || 600
    const H = rect.height || 500
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    try {
      const data = toShapes({ configuration, width: W, height: H, shapeSize })
      if (!data?.shapes?.length) return

      ctx.save()
      ctx.translate(W / 2, H / 2)

      for (const shape of data.shapes) {
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
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.restore()
    } catch (err) {
      console.error('Failed to render tiling:', err)
    }
  }, [configuration, shapeSize])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
