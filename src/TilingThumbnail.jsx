import { useEffect, useRef } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'
import { generateMultigrid } from './penrose'
import { generateTruchetTiling, drawTruchetShapes } from './truchet'

const PALETTE = {
  3:  ['rgba(255,107, 87,0.25)', 'rgba(255,107, 87,0.85)'],
  4:  ['rgba( 72,149,239,0.25)', 'rgba( 72,149,239,0.85)'],
  6:  ['rgba(167, 86,255,0.25)', 'rgba(167, 86,255,0.85)'],
  8:  ['rgba( 67,210,163,0.25)', 'rgba( 67,210,163,0.85)'],
  12: ['rgba(255,200, 55,0.25)', 'rgba(255,200, 55,0.85)'],
}
const DEFAULT_COLOR = ['rgba(200,200,255,0.2)', 'rgba(200,200,255,0.8)']

const MULTIGRID_COLORS = [
  ['rgba(255,195, 40,0.28)', 'rgba(255,195, 40,0.90)'],
  ['rgba(255,120, 40,0.22)', 'rgba(255,140, 50,0.85)'],
  ['rgba(220,  60, 60,0.22)', 'rgba(230,  80, 80,0.85)'],
  ['rgba(140,  60,220,0.22)', 'rgba(160,  80,230,0.85)'],
]

export default function TilingThumbnail({ configuration, size = 88 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(size / 2, size / 2)

    if (configuration === 'truchet') {
      const shapes = generateTruchetTiling(size, size)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1
      drawTruchetShapes(ctx, shapes)
      ctx.restore()
      return
    }

    let shapes = []
    if (configuration.startsWith('penrose')) {
      const sym = parseInt(configuration.slice(6)) || 5
      shapes = generateMultigrid(size, size, sym)
    } else {
      try {
        const data = toShapes({ configuration, width: size, height: size, shapeSize: 32 })
        shapes = data?.shapes ?? []
      } catch {
        ctx.restore()
        return
      }
    }

    for (const shape of shapes) {
      const vertices = shape[0]
      const meta = shape[1]
      if (!vertices || vertices.length < 3) continue
      let [fill, stroke] = PALETTE[vertices.length] ?? DEFAULT_COLOR
      if (meta?.multigrid) [fill, stroke] = MULTIGRID_COLORS[meta.diff - 1] ?? DEFAULT_COLOR
      ctx.beginPath()
      ctx.moveTo(vertices[0][0], vertices[0][1])
      for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i][0], vertices[i][1])
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    ctx.restore()
  }, [configuration, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: 'block', width: size, height: size }}
    />
  )
}
