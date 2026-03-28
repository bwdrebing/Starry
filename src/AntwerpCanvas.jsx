import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'
import { drawHankin, getHankinSegments } from './hankin'
import { generateMultigrid } from './penrose'

const PALETTE = {
  3:  ['rgba(255,107, 87,0.2)', 'rgba(255,107, 87,0.9)'],
  4:  ['rgba( 72,149,239,0.2)', 'rgba( 72,149,239,0.9)'],
  6:  ['rgba(167, 86,255,0.2)', 'rgba(167, 86,255,0.9)'],
  8:  ['rgba( 67,210,163,0.2)', 'rgba( 67,210,163,0.9)'],
  12: ['rgba(255,200, 55,0.2)', 'rgba(255,200, 55,0.9)'],
}
const DEFAULT_COLOR = ['rgba(200,200,255,0.2)', 'rgba(200,200,255,0.8)']

// Rhombus colours indexed by angular-step difference between line families.
// diff=1 → most acute rhombus; higher diff → closer to a square.
const MULTIGRID_COLORS = [
  ['rgba(255,195, 40,0.28)', 'rgba(255,195, 40,0.90)'],  // diff 1 — gold
  ['rgba(255,120, 40,0.22)', 'rgba(255,140, 50,0.85)'],  // diff 2 — amber
  ['rgba(220,  60, 60,0.22)', 'rgba(230,  80, 80,0.85)'], // diff 3 — red
  ['rgba(140,  60,220,0.22)', 'rgba(160,  80,230,0.85)'], // diff 4 — purple
]

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

function fmt(n) { return n.toFixed(4) }
function segPath([p1, p2]) { return `M ${fmt(p1[0])},${fmt(p1[1])} L ${fmt(p2[0])},${fmt(p2[1])}` }

const AntwerpCanvas = forwardRef(function AntwerpCanvas({ configuration, shapeSize = 48, mode = 'tiling', theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, showMotif = true, parquetDirection = 'none', thetaMin = Math.PI / 4, thetaMax = Math.PI / 4, radius = 1, parquetFunction = 'wave-ltr', animSpeed = 1 }, ref) {
  const canvasRef = useRef(null)
  const allShapesRef = useRef([])
  const shapesRef = useRef([])
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const gestureRef = useRef(null)
  const modeRef = useRef(mode)
  const thetaRef = useRef(theta)
  const deltaRef = useRef(delta)
  const debugRef = useRef(debug)
  const thickRef = useRef(thick)
  const overlapRef = useRef(overlap)
  const overlapGapRef = useRef(overlapGap)
  const bandWidthRef = useRef(bandWidth)
  const showMotifRef = useRef(showMotif)
  const parquetDirectionRef = useRef(parquetDirection)
  const thetaMinRef = useRef(thetaMin)
  const thetaMaxRef = useRef(thetaMax)
  const radiusRef = useRef(radius)
  const parquetFunctionRef = useRef(parquetFunction)
  const animSpeedRef = useRef(animSpeed)

  // Filter allShapesRef by radius fraction and write result into shapesRef.
  const applyRadius = useCallback(() => {
    const r = radiusRef.current
    const all = allShapesRef.current
    if (r >= 1) { shapesRef.current = all; return }
    const dists = all.map(shape => {
      const raw = shape[0]
      if (!raw || raw.length < 3) return 0
      const n = raw.length
      const cx = raw.reduce((s, v) => s + v[0], 0) / n
      const cy = raw.reduce((s, v) => s + v[1], 0) / n
      return Math.sqrt(cx * cx + cy * cy)
    })
    const maxDist = Math.max(...dists, 1e-8)
    shapesRef.current = all.filter((_, i) => dists[i] <= r * maxDist)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const { x, y, scale } = transformRef.current
    const currentMode = modeRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2 + x, H / 2 + y)
    ctx.scale(scale, scale)

    if (currentMode === 'tiling') {
      for (const shape of shapesRef.current) {
        const vertices = shape[0]
        const meta     = shape[1]
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
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }
    } else {
      // Motif mode: faint outlines + Hankin straps
      ctx.lineWidth = 1 / scale

      // Faint polygon outlines
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      for (const shape of shapesRef.current) {
        const vertices = shape[0]
        if (!vertices || vertices.length < 3) continue
        ctx.beginPath()
        ctx.moveTo(vertices[0][0], vertices[0][1])
        for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i][0], vertices[i][1])
        ctx.closePath()
        ctx.stroke()
      }

      // Hankin straps
      if (showMotifRef.current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.5 / scale
        drawHankin(ctx, shapesRef.current, thetaRef.current, deltaRef.current, debugRef.current, thickRef.current, overlapRef.current, overlapGapRef.current, bandWidthRef.current, parquetDirectionRef.current, thetaMinRef.current, thetaMaxRef.current, parquetFunctionRef.current, performance.now() / 1000, animSpeedRef.current)
      }
    }

    ctx.restore()
  }, [])

  // Keep refs in sync and redraw when display props change
  useEffect(() => {
    modeRef.current = mode
    thetaRef.current = theta
    deltaRef.current = delta
    debugRef.current = debug
    thickRef.current = thick
    overlapRef.current = overlap
    overlapGapRef.current = overlapGap
    bandWidthRef.current = bandWidth
    showMotifRef.current = showMotif
    parquetDirectionRef.current = parquetDirection
    thetaMinRef.current = thetaMin
    thetaMaxRef.current = thetaMax
    radiusRef.current = radius
    parquetFunctionRef.current = parquetFunction
    animSpeedRef.current = animSpeed
    applyRadius()
    draw()
  }, [mode, theta, delta, debug, thick, overlap, overlapGap, bandWidth, showMotif, parquetDirection, thetaMin, thetaMax, radius, parquetFunction, animSpeed, applyRadius, draw])

  // Animation loop for time-based function mode
  useEffect(() => {
    if (parquetDirection !== 'fn') return
    let animId
    function animate() {
      animId = requestAnimationFrame(animate)
      draw()
    }
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [parquetDirection, draw])

  // Recompute shapes and reset view when configuration changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !configuration) return

    const rect = canvas.getBoundingClientRect()
    const W = rect.width || 600
    const H = rect.height || 500
    canvas.width = W
    canvas.height = H

    if (configuration.startsWith('penrose')) {
      const sym = parseInt(configuration.slice(6)) || 5
      allShapesRef.current = generateMultigrid(W, H, sym)
    } else {
      try {
        const data = toShapes({ configuration, width: W, height: H, shapeSize })
        allShapesRef.current = data?.shapes ?? []
      } catch (err) {
        console.error('Failed to generate tiling:', err)
        allShapesRef.current = []
      }
    }
    applyRadius()

    transformRef.current = { x: 0, y: 0, scale: 1 }
    draw()
  }, [configuration, shapeSize, applyRadius, draw])

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

    function onTouchEnd() { gestureRef.current = null }

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

  useImperativeHandle(ref, () => ({
    exportSVG() {
      const canvas = canvasRef.current
      if (!canvas) return
      const W = canvas.width
      const H = canvas.height
      const { x, y, scale } = transformRef.current
      const shapes = shapesRef.current

      const px = n => n.toFixed(4)

      let motifContent = ''
      if (showMotifRef.current) {
        const { underSegs, overSegs } = getHankinSegments(
          shapes,
          thetaRef.current, deltaRef.current,
          thickRef.current, overlapRef.current,
          overlapGapRef.current, bandWidthRef.current,
          parquetDirectionRef.current, thetaMinRef.current, thetaMaxRef.current,
          parquetFunctionRef.current, 0
        )
        const underPaths = underSegs.map(s => `    <path d="${segPath(s)}"/>`).join('\n')
        const overPaths  = overSegs.map(s  => `    <path d="${segPath(s)}"/>`).join('\n')
        motifContent = `
  <g id="under">
${underPaths}
  </g>
  <g id="over">
${overPaths}
  </g>`
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<g transform="translate(${px(W / 2 + x)},${px(H / 2 + y)}) scale(${px(scale)})">
  <g id="motif" fill="none" stroke="#000" stroke-width="${px(1.5 / scale)}">${motifContent}
  </g>
</g>
</svg>`

      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'starry-pattern.svg'
      a.click()
      URL.revokeObjectURL(url)
    }
  }))

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
  )
})

export default AntwerpCanvas
