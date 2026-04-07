import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'
import { drawHankin, getHankinSegments } from './hankin'
import { generateMultigrid } from './penrose'
import { generateTruchetTiling, drawTruchetShapes, getTruchetPaths, VERTEX_COLORS,
         subdivideTruchetShapes, canMergeTruchetShapes, mergeTruchetShapes } from './truchet'

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

function pointInTri(px, py, [[ax, ay], [bx, by], [cx, cy]]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

const AntwerpCanvas = forwardRef(function AntwerpCanvas({ configuration, shapeSize = 48, mode = 'tiling', theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, showMotif = true, parquetDirection = 'none', thetaMin = Math.PI / 4, thetaMax = Math.PI / 4, radius = 1, parquetFunction = 'wave-ltr', animSpeed = 1, onTileClick = null, selectedTileIdx = -1 }, ref) {
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
  const isTruchetRef        = useRef(false)
  const selectedTileIdxRef  = useRef(-1)
  const onTileClickRef      = useRef(onTileClick)

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

    const isTruchet = shapesRef.current[0]?.[1]?.truchet === true
    isTruchetRef.current = isTruchet

    ctx.save()
    ctx.translate(W / 2 + x, H / 2 + y)
    ctx.scale(scale, scale)

    if (isTruchet) {
      // Faint triangle outlines — always visible as a debugging aid
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1 / scale
      for (const [pts] of shapesRef.current) {
        if (!pts || pts.length < 3) continue
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
        ctx.closePath()
        ctx.stroke()
      }

      // Highlight selected tile
      const selIdx = selectedTileIdxRef.current
      if (selIdx >= 0) {
        const sel = allShapesRef.current[selIdx]
        if (sel?.[0]?.length >= 3) {
          const sp = sel[0]
          ctx.strokeStyle = 'rgba(255,255,80,0.9)'
          ctx.lineWidth = 2.5 / scale
          ctx.beginPath()
          ctx.moveTo(sp[0][0], sp[0][1])
          for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1])
          ctx.closePath()
          ctx.stroke()
        }
      }

      if (showMotifRef.current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.5 / scale
        drawTruchetShapes(ctx, shapesRef.current, selectedTileIdxRef.current)
      }
    } else if (currentMode === 'tiling') {
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

  useEffect(() => {
    onTileClickRef.current = onTileClick
  }, [onTileClick])

  useEffect(() => {
    selectedTileIdxRef.current = selectedTileIdx
    draw()
  }, [selectedTileIdx, draw])

  // Recompute shapes and reset view when configuration changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !configuration) return

    const rect = canvas.getBoundingClientRect()
    const W = rect.width || 600
    const H = rect.height || 500
    canvas.width = W
    canvas.height = H

    if (configuration === 'truchet') {
      allShapesRef.current = generateTruchetTiling(W, H)
    } else if (configuration.startsWith('penrose')) {
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
          startClientX: e.touches[0].clientX,
          startClientY: e.touches[0].clientY,
          moved: false,
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
        const ddx = e.touches[0].clientX - g.startClientX
        const ddy = e.touches[0].clientY - g.startClientY
        if (ddx * ddx + ddy * ddy > 64) g.moved = true  // >8px = pan, not tap
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
      const g = gestureRef.current
      // A single-finger touch that didn't move is a tap → run hit test
      if (g?.type === 'pan' && !g.moved && isTruchetRef.current) {
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const cx = g.startClientX - rect.left
          const cy = g.startClientY - rect.top
          const { x, y, scale } = transformRef.current
          const dx = (cx - canvas.width / 2 - x) / scale
          const dy = (cy - canvas.height / 2 - y) / scale
          for (const [pts, meta] of shapesRef.current) {
            if (pts?.length >= 3 && pointInTri(dx, dy, pts)) {
              onTileClickRef.current?.(meta._idx ?? -1, { ...meta })
              gestureRef.current = null
              return
            }
          }
          onTileClickRef.current?.(-1, null)
        }
      }
      gestureRef.current = null
    }

    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      transformRef.current.scale = Math.max(0.2, Math.min(10, transformRef.current.scale * factor))
      draw()
    }

    function onCanvasClick(e) {
      if (!isTruchetRef.current) return
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { x, y, scale } = transformRef.current
      const W = canvas.width
      const H = canvas.height
      const dx = (cx - W / 2 - x) / scale
      const dy = (cy - H / 2 - y) / scale
      for (const [pts, meta] of shapesRef.current) {
        if (pts?.length >= 3 && pointInTri(dx, dy, pts)) {
          onTileClickRef.current?.(meta._idx ?? -1, { ...meta })
          return
        }
      }
      onTileClickRef.current?.(-1, null)
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('click', onCanvasClick)
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('click', onCanvasClick)
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
      const isTruchet = shapes[0]?.[1]?.truchet
      if (isTruchet) {
        const arcPaths = getTruchetPaths(shapes)
        const pathEls  = arcPaths.map(d => `    <path d="${d}"/>`).join('\n')
        motifContent = `\n${pathEls}`
      } else if (showMotifRef.current) {
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
    },
    updateTileMeta(idx, updates) {
      const shapes = allShapesRef.current
      if (!shapes[idx]) return
      Object.assign(shapes[idx][1], updates)
      draw()
    },
    getTileMeta(idx) {
      return allShapesRef.current[idx]?.[1] ?? null
    },
    subdivideTile(idx) {
      const ok = subdivideTruchetShapes(allShapesRef.current, idx)
      if (ok) { applyRadius(); draw() }
      return ok
    },
    canMergeTile(idx) {
      return canMergeTruchetShapes(allShapesRef.current, idx)
    },
    mergeTile(idx) {
      const newIdx = mergeTruchetShapes(allShapesRef.current, idx)
      if (newIdx >= 0) { applyRadius(); draw() }
      return newIdx
    },
    getShapes() {
      return allShapesRef.current
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
    />
  )
})

export default AntwerpCanvas
