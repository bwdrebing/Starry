import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import toShapes from '@hhogg/antwerp/lib/cjs/toShapes'
import { drawHankin, getHankinSegments } from './hankin'
import { generateMultigrid } from './penrose'
import { generateTruchetTiling, drawTruchetShapes, getTruchetPaths, VERTEX_COLORS,
         subdivideTruchetShapes, canMergeTruchetShapes, mergeTruchetShapes } from './truchet'
import { generateSquareTruchetTiling, drawSquareTruchetShapes, getSquareTruchetPaths,
         subdivideSquareTruchetShapes, canMergeSquareTruchetShapes, mergeSquareTruchetShapes } from './squareTruchet'

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

function pointInPoly(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1]
    const xj = pts[j][0], yj = pts[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

const AntwerpCanvas = forwardRef(function AntwerpCanvas({ configuration, shapeSize = 48, mode = 'tiling', theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, showMotif = true, parquetDirection = 'none', thetaMin = Math.PI / 4, thetaMax = Math.PI / 4, radius = 1, parquetFunction = 'wave-ltr', animSpeed = 1, onTileClick = null, selectedTileIdx = -1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, onParquetParamChange = null }, ref) {
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
  const linearAngleRef = useRef(linearAngle)
  const centerXRef = useRef(centerX)
  const centerYRef = useRef(centerY)
  const ellipseAngleRef = useRef(ellipseAngle)
  const ellipseMajorScaleRef = useRef(ellipseMajorScale)
  const ellipseMinorScaleRef = useRef(ellipseMinorScale)
  const onParquetParamChangeRef = useRef(onParquetParamChange)
  const boundsRef = useRef({ minX: -200, maxX: 200, minY: -200, maxY: 200, maxR: 200 })
  const isTruchetRef        = useRef(false)
  const selectedTileIdxRef  = useRef(-1)
  const onTileClickRef      = useRef(onTileClick)

  // Filter allShapesRef by radius fraction and write result into shapesRef.
  const applyRadius = useCallback(() => {
    const r = radiusRef.current
    const all = allShapesRef.current
    if (r >= 1) { shapesRef.current = all } else {
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
    }
    // Recompute spatial bounds used for handle positioning.
    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity, bMaxR = 0
    for (const shape of shapesRef.current) {
      const raw = shape[0]; if (!raw) continue
      for (const [x, y] of raw) {
        if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x
        if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y
        const rr = Math.sqrt(x * x + y * y); if (rr > bMaxR) bMaxR = rr
      }
    }
    if (bMaxR > 0) boundsRef.current = { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY, maxR: bMaxR }
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

    const firstMeta = shapesRef.current[0]?.[1]
    const isTruchet = firstMeta?.truchet === true || firstMeta?.squareTruchet === true
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
        if (shapesRef.current[0]?.[1]?.squareTruchet) {
          drawSquareTruchetShapes(ctx, shapesRef.current, selectedTileIdxRef.current)
        } else {
          drawTruchetShapes(ctx, shapesRef.current, selectedTileIdxRef.current)
        }
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
        drawHankin(ctx, shapesRef.current, thetaRef.current, deltaRef.current, debugRef.current, thickRef.current, overlapRef.current, overlapGapRef.current, bandWidthRef.current, parquetDirectionRef.current, thetaMinRef.current, thetaMaxRef.current, parquetFunctionRef.current, performance.now() / 1000, animSpeedRef.current, linearAngleRef.current, centerXRef.current, centerYRef.current, ellipseAngleRef.current, ellipseMajorScaleRef.current, ellipseMinorScaleRef.current)
      }
    }

    // Interactive control handles for linear and centered parquet modes.
    const pd = parquetDirectionRef.current
    if (pd === 'ltr' || pd === 'centered') {
      const { maxR } = boundsRef.current
      const baseR = maxR * 0.45
      const hr = 8 / scale
      const lw = 1.5 / scale

      ctx.save()
      ctx.lineWidth = lw

      if (pd === 'ltr') {
        const a = linearAngleRef.current
        const hx = Math.cos(a) * baseR, hy = Math.sin(a) * baseR

        ctx.strokeStyle = 'rgba(255,210,60,0.75)'
        ctx.setLineDash([5 / scale, 4 / scale])
        ctx.beginPath(); ctx.moveTo(-hx, -hy); ctx.lineTo(hx, hy); ctx.stroke()
        ctx.setLineDash([])

        // Arrowhead at the positive end
        const as = hr * 1.3
        const px = -Math.sin(a), py = Math.cos(a)
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(hx - Math.cos(a) * as + px * as * 0.5, hy - Math.sin(a) * as + py * as * 0.5)
        ctx.moveTo(hx, hy)
        ctx.lineTo(hx - Math.cos(a) * as - px * as * 0.5, hy - Math.sin(a) * as - py * as * 0.5)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,210,60,0.9)'
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        for (const [px2, py2] of [[hx, hy], [-hx, -hy]]) {
          ctx.beginPath(); ctx.arc(px2, py2, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        }
      }

      if (pd === 'centered') {
        const cx2 = centerXRef.current, cy2 = centerYRef.current
        const ea = ellipseAngleRef.current
        const majorS = ellipseMajorScaleRef.current || 1
        const minorS = ellipseMinorScaleRef.current || 1
        const baseR = maxR * 0.45
        const majorLen = majorS * baseR
        const minorLen = minorS * baseR
        const ax = cx2 + Math.cos(ea) * majorLen, ay = cy2 + Math.sin(ea) * majorLen
        const rx2 = cx2 - Math.sin(ea) * minorLen, ry2 = cy2 + Math.cos(ea) * minorLen

        // Ellipse outline
        ctx.strokeStyle = 'rgba(255,210,60,0.45)'
        ctx.setLineDash([5 / scale, 4 / scale])
        ctx.save()
        ctx.translate(cx2, cy2); ctx.rotate(ea)
        ctx.beginPath(); ctx.ellipse(0, 0, majorLen, minorLen, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
        ctx.setLineDash([])

        // Spoke lines from center to handles
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.moveTo(cx2, cy2); ctx.lineTo(ax, ay)
        ctx.moveTo(cx2, cy2); ctx.lineTo(rx2, ry2)
        ctx.stroke()

        // Center handle (gold)
        ctx.fillStyle = 'rgba(255,210,60,0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath(); ctx.arc(cx2, cy2, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

        // Major-axis handle (blue) — drag sets angle + major scale
        ctx.fillStyle = 'rgba(80,180,255,0.9)'
        ctx.beginPath(); ctx.arc(ax, ay, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

        // Minor-axis handle (green) — drag sets minor scale
        ctx.fillStyle = 'rgba(80,235,110,0.9)'
        ctx.beginPath(); ctx.arc(rx2, ry2, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }

      ctx.restore()
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
    linearAngleRef.current = linearAngle
    centerXRef.current = centerX
    centerYRef.current = centerY
    ellipseAngleRef.current = ellipseAngle
    ellipseMajorScaleRef.current = ellipseMajorScale
    ellipseMinorScaleRef.current = ellipseMinorScale
    onParquetParamChangeRef.current = onParquetParamChange
    applyRadius()
    draw()
  }, [mode, theta, delta, debug, thick, overlap, overlapGap, bandWidth, showMotif, parquetDirection, thetaMin, thetaMax, radius, parquetFunction, animSpeed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale, onParquetParamChange, applyRadius, draw])

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
    } else if (configuration === 'squareTruchet') {
      allShapesRef.current = generateSquareTruchetTiling(W, H)
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

  // All canvas interaction: pan/pinch/zoom, parquet handle drag (mouse + touch), cursor feedback.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── coordinate helpers ───────────────────────────────────────────────────
    function cssToWorld(cssX, cssY) {
      const rect = canvas.getBoundingClientRect()
      const { x: px, y: py, scale } = transformRef.current
      return [(cssX - rect.width / 2 - px) / scale, (cssY - rect.height / 2 - py) / scale]
    }

    function getHandleHit(wx, wy) {
      const pd = parquetDirectionRef.current
      if (pd !== 'ltr' && pd !== 'centered') return null
      const { maxR } = boundsRef.current
      const { scale } = transformRef.current
      const HR = 18 / scale
      const baseR = maxR * 0.45
      if (pd === 'ltr') {
        const a = linearAngleRef.current
        const hx = Math.cos(a) * baseR, hy = Math.sin(a) * baseR
        if (Math.hypot(wx - hx, wy - hy) < HR || Math.hypot(wx + hx, wy + hy) < HR) return 'linear'
      }
      if (pd === 'centered') {
        const cx2 = centerXRef.current, cy2 = centerYRef.current
        const ea = ellipseAngleRef.current
        const majorLen = (ellipseMajorScaleRef.current || 1) * baseR
        const minorLen = (ellipseMinorScaleRef.current || 1) * baseR
        const ax = cx2 + Math.cos(ea) * majorLen, ay = cy2 + Math.sin(ea) * majorLen
        const rx2 = cx2 - Math.sin(ea) * minorLen, ry2 = cy2 + Math.cos(ea) * minorLen
        if (Math.hypot(wx - ax, wy - ay) < HR) return 'ellipse-major'
        if (Math.hypot(wx - rx2, wy - ry2) < HR) return 'ellipse-minor'
        if (Math.hypot(wx - cx2, wy - cy2) < HR) return 'center'
      }
      return null
    }

    function applyHandleUpdate(handleType, wx, wy) {
      const { maxR } = boundsRef.current
      const baseR = maxR * 0.45
      if (handleType === 'linear') {
        const angle = Math.atan2(wy, wx)
        linearAngleRef.current = angle
        draw()
        onParquetParamChangeRef.current?.({ linearAngle: angle })
      } else if (handleType === 'center') {
        centerXRef.current = wx; centerYRef.current = wy
        draw()
        onParquetParamChangeRef.current?.({ centerX: wx, centerY: wy })
      } else if (handleType === 'ellipse-major') {
        // Drag sets both rotation angle and major-axis scale.
        const angle = Math.atan2(wy - centerYRef.current, wx - centerXRef.current)
        const dist = Math.hypot(wx - centerXRef.current, wy - centerYRef.current)
        const majorScale = Math.max(0.1, Math.min(5, dist / baseR))
        ellipseAngleRef.current = angle
        ellipseMajorScaleRef.current = majorScale
        draw()
        onParquetParamChangeRef.current?.({ ellipseAngle: angle, ellipseMajorScale: majorScale })
      } else if (handleType === 'ellipse-minor') {
        // Project onto the current minor-axis direction and use the length as the scale.
        const ea = ellipseAngleRef.current
        const minorX = -Math.sin(ea), minorY = Math.cos(ea)
        const proj = Math.abs((wx - centerXRef.current) * minorX + (wy - centerYRef.current) * minorY)
        const minorScale = Math.max(0.1, Math.min(5, proj / baseR))
        ellipseMinorScaleRef.current = minorScale
        draw()
        onParquetParamChangeRef.current?.({ ellipseMinorScale: minorScale })
      }
    }

    // ── touch events ──────────────────────────────────────────────────────────
    function onTouchStart(e) {
      e.preventDefault()
      if (e.touches.length === 1) {
        const t = e.touches[0]
        const rect = canvas.getBoundingClientRect()
        const [wx, wy] = cssToWorld(t.clientX - rect.left, t.clientY - rect.top)
        const hit = getHandleHit(wx, wy)
        if (hit) {
          gestureRef.current = { type: 'handle-drag', handleType: hit }
          return
        }
        gestureRef.current = {
          type: 'pan',
          startX: t.clientX - transformRef.current.x,
          startY: t.clientY - transformRef.current.y,
          startClientX: t.clientX,
          startClientY: t.clientY,
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
      if (g.type === 'handle-drag' && e.touches.length === 1) {
        const t = e.touches[0]
        const rect = canvas.getBoundingClientRect()
        const [wx, wy] = cssToWorld(t.clientX - rect.left, t.clientY - rect.top)
        applyHandleUpdate(g.handleType, wx, wy)
      } else if (g.type === 'pan' && e.touches.length === 1) {
        const ddx = e.touches[0].clientX - g.startClientX
        const ddy = e.touches[0].clientY - g.startClientY
        if (ddx * ddx + ddy * ddy > 64) g.moved = true
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
      if (g?.type === 'pan' && !g.moved && isTruchetRef.current) {
        const rect = canvas.getBoundingClientRect()
        const cx = g.startClientX - rect.left
        const cy = g.startClientY - rect.top
        const { x, y, scale } = transformRef.current
        const dx = (cx - rect.width / 2 - x) / scale
        const dy = (cy - rect.height / 2 - y) / scale
        for (const [pts, meta] of shapesRef.current) {
          if (pts?.length >= 3 && pointInPoly(dx, dy, pts)) {
            onTileClickRef.current?.(meta._idx ?? -1, { ...meta })
            gestureRef.current = null
            return
          }
        }
        onTileClickRef.current?.(-1, null)
      }
      gestureRef.current = null
    }

    // ── mouse events ──────────────────────────────────────────────────────────
    let mouseDragging = null

    function onMouseDown(e) {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = cssToWorld(e.clientX - rect.left, e.clientY - rect.top)
      const hit = getHandleHit(wx, wy)
      if (hit) {
        mouseDragging = hit
        canvas.style.cursor = 'grabbing'
        e.preventDefault()
        e.stopPropagation()
      }
    }

    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = cssToWorld(e.clientX - rect.left, e.clientY - rect.top)
      if (mouseDragging) {
        applyHandleUpdate(mouseDragging, wx, wy)
        e.preventDefault()
        return
      }
      // Cursor feedback when hovering over a handle
      const hit = getHandleHit(wx, wy)
      canvas.style.cursor = hit ? 'grab' : ''
    }

    function onMouseUp(e) {
      if (!mouseDragging) return
      mouseDragging = null
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = cssToWorld(e.clientX - rect.left, e.clientY - rect.top)
      canvas.style.cursor = getHandleHit(wx, wy) ? 'grab' : ''
    }

    // ── wheel zoom ────────────────────────────────────────────────────────────
    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      transformRef.current.scale = Math.max(0.2, Math.min(10, transformRef.current.scale * factor))
      draw()
    }

    // ── click (truchet tile selection) ────────────────────────────────────────
    function onCanvasClick(e) {
      if (!isTruchetRef.current) return
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { x, y, scale } = transformRef.current
      const dx = (cx - rect.width / 2 - x) / scale
      const dy = (cy - rect.height / 2 - y) / scale
      for (const [pts, meta] of shapesRef.current) {
        if (pts?.length >= 3 && pointInPoly(dx, dy, pts)) {
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
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
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
      const firstMetaSVG = shapes[0]?.[1]
      if (firstMetaSVG?.squareTruchet) {
        const arcPaths = getSquareTruchetPaths(shapes)
        const pathEls  = arcPaths.map(d => `    <path d="${d}"/>`).join('\n')
        motifContent = `\n${pathEls}`
      } else if (firstMetaSVG?.truchet) {
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
          parquetFunctionRef.current, 0, 1,
          linearAngleRef.current, centerXRef.current, centerYRef.current,
          ellipseAngleRef.current, ellipseMajorScaleRef.current, ellipseMinorScaleRef.current
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
      const meta = allShapesRef.current[idx]?.[1]
      const ok = meta?.squareTruchet
        ? subdivideSquareTruchetShapes(allShapesRef.current, idx)
        : subdivideTruchetShapes(allShapesRef.current, idx)
      if (ok) { applyRadius(); draw() }
      return ok
    },
    canMergeTile(idx) {
      const meta = allShapesRef.current[idx]?.[1]
      return meta?.squareTruchet
        ? canMergeSquareTruchetShapes(allShapesRef.current, idx)
        : canMergeTruchetShapes(allShapesRef.current, idx)
    },
    mergeTile(idx) {
      const meta = allShapesRef.current[idx]?.[1]
      const newIdx = meta?.squareTruchet
        ? mergeSquareTruchetShapes(allShapesRef.current, idx)
        : mergeTruchetShapes(allShapesRef.current, idx)
      if (newIdx >= 0) { applyRadius(); draw() }
      return newIdx
    },
    getShapes() {
      return allShapesRef.current
    },
    getFilteredShapes() {
      return shapesRef.current
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
