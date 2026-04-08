// Square Truchet tiles.
//
// An axis-aligned square grid is generated targeting ~40 large squares.
// Each square has four corner vertices A B C D (clockwise from a randomly
// chosen start corner).  Concentric quarter-circle arcs are drawn from A
// edge-to-edge, then B clipped outside A's disc, C clipped outside A's and
// B's discs, and D clipped outside all three discs, building a layered
// stacked-disc occlusion illusion from stroked lines alone.

// Arc angle ranges [startAngle, endAngle] for each corner index.
// Vertex order: v0=TL, v1=TR, v2=BR, v3=BL.
// Angles are clockwise from +x (canvas Y-down: 0°=right, 90°=down).
const ARC_ANGLES = [
  [0,                Math.PI / 2],        // v0 TL:   0° →  90°
  [Math.PI / 2,      Math.PI],            // v1 TR:  90° → 180°
  [Math.PI,          3 * Math.PI / 2],    // v2 BR: 180° → 270°
  [3 * Math.PI / 2,  2 * Math.PI],        // v3 BL: 270° → 360°
]

// Arc counts per size class.  All three share the same absolute lineSpacing:
//   large : squareBase   / 16  (arcCount=15, aCount=13)
//   medium: squareBase/2 / 8   (arcCount= 8, aCount= 6)
//   small : squareBase/4 / 4   (arcCount= 5, aCount= 3)
const ARC_COUNT = { large: 15, medium: 8, small: 5 }

function outerRadius(arcSet, lineSpacing) {
  for (let k = arcSet.length; k >= 1; k--) {
    if (arcSet[k - 1]) return k * lineSpacing
  }
  return 0
}

function makeArcSet(len, suppressed) {
  return new Array(len).fill(!suppressed)
}

// ---------------------------------------------------------------------------
// Clipping helper
// ---------------------------------------------------------------------------

// Returns the sub-arc of [a1, a2] (drawn clockwise) that lies OUTSIDE the
// disc (discCenter, discR), or null if the arc is entirely inside.
function clipArcOutsideDisc(arcCenter, arcR, a1, a2, discCenter, discR) {
  const dx = arcCenter[0] - discCenter[0]
  const dy = arcCenter[1] - discCenter[1]
  const d  = Math.hypot(dx, dy)
  if (d < 1e-10) return null

  const Kp    = (discR * discR - d * d - arcR * arcR) / (2 * arcR)
  const ratio = Kp / d

  if (ratio >=  1 - 1e-9) return null
  if (ratio <= -1 + 1e-9) return [a1, a2]

  const phi    = Math.atan2(dy, dx)
  const alpha  = Math.acos(Math.max(-1, Math.min(1, ratio)))
  const tEnter = phi - alpha
  const tExit  = phi + alpha

  const TAU  = 2 * Math.PI
  const norm = t => { const dt = (((t - a1) % TAU) + TAU) % TAU; return a1 + dt }

  const nEnter  = norm(tEnter)
  const nExit   = norm(tExit)
  const enterIn = nEnter < a2
  const exitIn  = nExit  < a2

  if (!enterIn && !exitIn) {
    const mid = (a1 + a2) / 2
    const ex  = arcCenter[0] + arcR * Math.cos(mid) - discCenter[0]
    const ey  = arcCenter[1] + arcR * Math.sin(mid) - discCenter[1]
    return Math.hypot(ex, ey) > discR ? [a1, a2] : null
  }
  if ( enterIn && !exitIn) return [nEnter, a2]
  if (!enterIn &&  exitIn) return [a1, nExit]
  return [nEnter, nExit]
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function vKey(p) { return `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}` }
function sqKey(pts) { return pts.map(vKey).sort().join('|') }

function edgeKey(p1, p2) {
  const ax = Math.round(p1[0] * 100), ay = Math.round(p1[1] * 100)
  const bx = Math.round(p2[0] * 100), by = Math.round(p2[1] * 100)
  return ax < bx || (ax === bx && ay < by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`
}

// Split one square into four by midpoint subdivision.
// Vertex order [TL, TR, BR, BL] is preserved in each child.
function splitSquare(pts) {
  const [p0, p1, p2, p3] = pts
  const m01 = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2]
  const m12 = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2]
  const m23 = [(p2[0]+p3[0])/2, (p2[1]+p3[1])/2]
  const m30 = [(p3[0]+p0[0])/2, (p3[1]+p0[1])/2]
  const ctr  = [(p0[0]+p2[0])/2, (p0[1]+p2[1])/2]
  return [
    { pts: [p0,  m01, ctr,  m30] },   // TL child
    { pts: [m01, p1,  m12,  ctr] },   // TR child
    { pts: [ctr, m12, p2,   m23] },   // BR child
    { pts: [m30, ctr, m23,  p3 ] },   // BL child
  ]
}

// ---------------------------------------------------------------------------
// Tiling generation
// ---------------------------------------------------------------------------

export function generateSquareTruchetTiling(W, H) {
  const squareBase  = Math.sqrt(W * H / 40)
  const lineSpacing = squareBase / 16

  const halfW = W / 2
  const halfH = H / 2
  const nCols = Math.ceil(halfW / squareBase) + 1
  const nRows = Math.ceil(halfH / squareBase) + 1

  // Build large-square grid centered at origin; vertices: [TL, TR, BR, BL]
  const largeSqs = []
  for (let r = -nRows; r <= nRows; r++) {
    for (let c = -nCols; c <= nCols; c++) {
      const x0 = c * squareBase
      const y0 = r * squareBase
      const x1 = x0 + squareBase
      const y1 = y0 + squareBase
      if (Math.abs(x0 + squareBase / 2) <= halfW && Math.abs(y0 + squareBase / 2) <= halfH)
        largeSqs.push({ pts: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] })
    }
  }

  // Build edge-sharing map; edges that appear only once are boundary
  const edgeMap = new Map()
  largeSqs.forEach((sq, si) => {
    for (let ei = 0; ei < 4; ei++) {
      const key = edgeKey(sq.pts[ei], sq.pts[(ei + 1) % 4])
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key).push({ si, ei })
    }
  })

  largeSqs.forEach(sq => {
    sq.exposedEdges = []
    for (let ei = 0; ei < 4; ei++) {
      const key = edgeKey(sq.pts[ei], sq.pts[(ei + 1) % 4])
      if (edgeMap.get(key).length === 1) sq.exposedEdges.push(ei)
    }
    sq.boundary = sq.exposedEdges.length > 0
  })

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  // Subdivide ~30% of interior large squares into 4 medium each
  const interiorIdx = largeSqs.flatMap((sq, i) => sq.boundary ? [] : [i])
  const nSplitL     = Math.max(2, Math.round(largeSqs.length * 0.3))
  const splitL      = new Set(shuffle(interiorIdx).slice(0, Math.min(nSplitL, interiorIdx.length)))

  const medSqs = []
  const result  = []

  largeSqs.forEach((sq, i) => {
    if (splitL.has(i)) {
      const pg = sqKey(sq.pts)
      splitSquare(sq.pts).forEach(child => medSqs.push({
        ...child, parentGroup: pg, parentVerts: sq.pts, parentSize: 'large',
      }))
    } else {
      result.push({ pts: sq.pts, size: 'large', boundary: sq.boundary, exposedEdges: sq.exposedEdges })
    }
  })

  // Subdivide ~25% of medium squares into 4 small each
  const nSplitM = Math.max(1, Math.round(medSqs.length * 0.25))
  const splitM  = new Set(shuffle(medSqs.map((_, i) => i)).slice(0, nSplitM))

  medSqs.forEach((sq, i) => {
    if (splitM.has(i)) {
      const pg = sqKey(sq.pts)
      splitSquare(sq.pts).forEach(child => result.push({
        ...child, size: 'small',
        parentGroup: pg, parentVerts: sq.pts, parentSize: 'medium',
        _parentInfo: {
          parentGroup: sq.parentGroup, parentVerts: sq.parentVerts,
          parentSize: sq.parentSize,
        },
      }))
    } else {
      result.push({ ...sq, size: 'medium' })
    }
  })

  return result.map(({ pts, size, boundary, exposedEdges,
                       parentGroup, parentVerts, parentSize, _parentInfo }, i) => {
    const arcCount = ARC_COUNT[size]
    const aCount   = arcCount - 2

    // For boundary squares, choose startPt as an interior (non-exposed) vertex
    let startPt
    if (boundary && exposedEdges?.length > 0) {
      const exposedVerts = new Set()
      exposedEdges.forEach(ei => {
        exposedVerts.add(ei)
        exposedVerts.add((ei + 1) % 4)
      })
      const interior = [0, 1, 2, 3].filter(v => !exposedVerts.has(v))
      startPt = interior.length > 0
        ? interior[Math.floor(Math.random() * interior.length)]
        : Math.floor(Math.random() * 4)
    } else {
      startPt = Math.floor(Math.random() * 4)
    }

    const isBoundary = !!boundary
    return [pts, {
      squareTruchet: true,
      startPt, arcCount, lineSpacing,
      size,
      boundary: isBoundary,
      arcSetA: makeArcSet(aCount, false),
      arcSetB: makeArcSet(aCount, isBoundary),
      arcSetC: makeArcSet(aCount, isBoundary),
      arcSetD: makeArcSet(Math.min(2, aCount), isBoundary),
      _idx: i,
      ...(parentGroup !== undefined ? { parentGroup, parentVerts, parentSize, _parentInfo } : {}),
    }]
  })
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

function arcToSVGPath(cx, cy, r, a1, a2) {
  const f  = n => n.toFixed(4)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const x2 = cx + r * Math.cos(a2)
  const y2 = cy + r * Math.sin(a2)
  const largeArc = (a2 - a1) > Math.PI ? 1 : 0
  return `M${f(x1)},${f(y1)} A${f(r)},${f(r)},0,${largeArc},1,${f(x2)},${f(y2)}`
}

export function getSquareTruchetPaths(shapes) {
  const paths = []
  for (const [pts, meta] of shapes) {
    if (!meta?.squareTruchet) continue
    const { startPt, arcCount, lineSpacing,
            arcSetA, arcSetB, arcSetC, arcSetD } = meta
    const aCount  = arcCount - 2
    const sA = arcSetA ?? makeArcSet(aCount, false)
    const sB = arcSetB ?? makeArcSet(aCount, false)
    const sC = arcSetC ?? makeArcSet(aCount, false)
    const sD = arcSetD ?? makeArcSet(Math.min(2, aCount), false)

    const vA      = pts[(startPt + 0) % 4]
    const vB      = pts[(startPt + 1) % 4]
    const vC      = pts[(startPt + 2) % 4]
    const discR_A = outerRadius(sA, lineSpacing)
    const discR_B = outerRadius(sB, lineSpacing)
    const discR_C = outerRadius(sC, lineSpacing)

    const dEdge = Math.hypot(vB[0] - vA[0], vB[1] - vA[1])

    // ── Vertex A ─────────────────────────────────────────────────────────────
    if (sA.some(Boolean)) {
      const vi       = (startPt + 0) % 4
      const [vx, vy] = vA
      const [a1, a2] = ARC_ANGLES[vi]
      for (let k = 1; k <= sA.length; k++) {
        if (!sA[k - 1]) continue
        paths.push(arcToSVGPath(vx, vy, k * lineSpacing, a1, a2))
      }
    }

    // ── Vertex B: clipped outside A's disc ───────────────────────────────────
    if (sB.some(Boolean)) {
      const vi       = (startPt + 1) % 4
      const [vx, vy] = vB
      const [a1, a2] = ARC_ANGLES[vi]
      const doClip   = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      for (let k = 1; k <= sB.length; k++) {
        if (!sB[k - 1]) continue
        const r = k * lineSpacing
        if (doClip) {
          const clipped = clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A)
          if (!clipped) continue
          const [da1, da2] = clipped
          if (da2 - da1 < 1e-6) continue
          paths.push(arcToSVGPath(vx, vy, r, da1, da2))
        } else {
          paths.push(arcToSVGPath(vx, vy, r, a1, a2))
        }
      }
    }

    // ── Vertex C: clipped outside A's and B's discs ───────────────────────────
    if (sC.some(Boolean)) {
      const vi       = (startPt + 2) % 4
      const [vx, vy] = vC
      const [a1, a2] = ARC_ANGLES[vi]
      const doClipA  = discR_A > 1e-6
      const doClipB  = discR_B > 1e-6
      for (let k = 1; k <= sC.length; k++) {
        if (!sC[k - 1]) continue
        const r    = k * lineSpacing
        const segA = doClipA ? clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A) : [a1, a2]
        const segB = doClipB ? clipArcOutsideDisc([vx, vy], r, a1, a2, vB, discR_B) : [a1, a2]
        if (!segA || !segB) continue
        const lo = Math.max(segA[0], segB[0])
        const hi = Math.min(segA[1], segB[1])
        if (hi - lo < 1e-6) continue
        paths.push(arcToSVGPath(vx, vy, r, lo, hi))
      }
    }

    // ── Vertex D: clipped outside A's, B's and C's discs ─────────────────────
    if (sD.some(Boolean)) {
      const vi       = (startPt + 3) % 4
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[vi]
      const doClipA  = discR_A > 1e-6
      const doClipB  = discR_B > 1e-6
      const doClipC  = discR_C > 1e-6
      for (let k = 1; k <= sD.length; k++) {
        if (!sD[k - 1]) continue
        const r    = k * lineSpacing
        const segA = doClipA ? clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A) : [a1, a2]
        const segB = doClipB ? clipArcOutsideDisc([vx, vy], r, a1, a2, vB, discR_B) : [a1, a2]
        const segC = doClipC ? clipArcOutsideDisc([vx, vy], r, a1, a2, vC, discR_C) : [a1, a2]
        if (!segA || !segB || !segC) continue
        const lo = Math.max(segA[0], segB[0], segC[0])
        const hi = Math.min(segA[1], segB[1], segC[1])
        if (hi - lo < 1e-6) continue
        paths.push(arcToSVGPath(vx, vy, r, lo, hi))
      }
    }
  }
  return paths
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export const SQUARE_VERTEX_COLORS = [
  'rgba(255, 110, 110, 0.95)',   // A — coral red
  'rgba(255, 200,  50, 0.95)',   // B — gold
  'rgba( 70, 190, 255, 0.95)',   // C — sky blue
  'rgba( 80, 220, 120, 0.95)',   // D — green
]

export function drawSquareTruchetShapes(ctx, shapes, selectedIdx = -1) {
  const baseStyle = ctx.strokeStyle
  for (const [pts, meta] of shapes) {
    if (!meta?.squareTruchet) continue
    const { startPt, arcCount, lineSpacing,
            arcSetA, arcSetB, arcSetC, arcSetD } = meta
    const aCount     = arcCount - 2
    const isSelected = selectedIdx >= 0 && meta._idx === selectedIdx

    const sA = arcSetA ?? makeArcSet(aCount, false)
    const sB = arcSetB ?? makeArcSet(aCount, false)
    const sC = arcSetC ?? makeArcSet(aCount, false)
    const sD = arcSetD ?? makeArcSet(Math.min(2, aCount), false)

    const vA      = pts[(startPt + 0) % 4]
    const vB      = pts[(startPt + 1) % 4]
    const vC      = pts[(startPt + 2) % 4]
    const discR_A = outerRadius(sA, lineSpacing)
    const discR_B = outerRadius(sB, lineSpacing)
    const discR_C = outerRadius(sC, lineSpacing)

    ctx.lineCap = 'round'

    const dEdge = Math.hypot(vB[0] - vA[0], vB[1] - vA[1])

    // ── Vertex A: full arcs ──────────────────────────────────────────────────
    if (sA.some(Boolean)) {
      ctx.strokeStyle = isSelected ? SQUARE_VERTEX_COLORS[0] : baseStyle
      const vi       = (startPt + 0) % 4
      const [vx, vy] = vA
      const [a1, a2] = ARC_ANGLES[vi]
      for (let k = 1; k <= sA.length; k++) {
        if (!sA[k - 1]) continue
        ctx.beginPath()
        ctx.arc(vx, vy, k * lineSpacing, a1, a2)
        ctx.stroke()
      }
    }

    // ── Vertex B: clipped outside A's disc ──────────────────────────────────
    if (sB.some(Boolean)) {
      ctx.strokeStyle = isSelected ? SQUARE_VERTEX_COLORS[1] : baseStyle
      const vi       = (startPt + 1) % 4
      const [vx, vy] = vB
      const [a1, a2] = ARC_ANGLES[vi]
      const doClip   = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      for (let k = 1; k <= sB.length; k++) {
        if (!sB[k - 1]) continue
        const r = k * lineSpacing
        if (doClip) {
          const clipped = clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A)
          if (!clipped) continue
          const [da1, da2] = clipped
          if (da2 - da1 < 1e-6) continue
          ctx.beginPath()
          ctx.arc(vx, vy, r, da1, da2)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(vx, vy, r, a1, a2)
          ctx.stroke()
        }
      }
    }

    // ── Vertex C: clipped outside A's and B's discs ──────────────────────────
    if (sC.some(Boolean)) {
      ctx.strokeStyle = isSelected ? SQUARE_VERTEX_COLORS[2] : baseStyle
      const vi       = (startPt + 2) % 4
      const [vx, vy] = vC
      const [a1, a2] = ARC_ANGLES[vi]
      const doClipA  = discR_A > 1e-6
      const doClipB  = discR_B > 1e-6
      for (let k = 1; k <= sC.length; k++) {
        if (!sC[k - 1]) continue
        const r    = k * lineSpacing
        const segA = doClipA ? clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A) : [a1, a2]
        const segB = doClipB ? clipArcOutsideDisc([vx, vy], r, a1, a2, vB, discR_B) : [a1, a2]
        if (!segA || !segB) continue
        const lo = Math.max(segA[0], segB[0])
        const hi = Math.min(segA[1], segB[1])
        if (hi - lo < 1e-6) continue
        ctx.beginPath()
        ctx.arc(vx, vy, r, lo, hi)
        ctx.stroke()
      }
    }

    // ── Vertex D: clipped outside A's, B's and C's discs ────────────────────
    if (sD.some(Boolean)) {
      ctx.strokeStyle = isSelected ? SQUARE_VERTEX_COLORS[3] : baseStyle
      const vi       = (startPt + 3) % 4
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[vi]
      const doClipA  = discR_A > 1e-6
      const doClipB  = discR_B > 1e-6
      const doClipC  = discR_C > 1e-6
      for (let k = 1; k <= sD.length; k++) {
        if (!sD[k - 1]) continue
        const r    = k * lineSpacing
        const segA = doClipA ? clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR_A) : [a1, a2]
        const segB = doClipB ? clipArcOutsideDisc([vx, vy], r, a1, a2, vB, discR_B) : [a1, a2]
        const segC = doClipC ? clipArcOutsideDisc([vx, vy], r, a1, a2, vC, discR_C) : [a1, a2]
        if (!segA || !segB || !segC) continue
        const lo = Math.max(segA[0], segB[0], segC[0])
        const hi = Math.min(segA[1], segB[1], segC[1])
        if (hi - lo < 1e-6) continue
        ctx.beginPath()
        ctx.arc(vx, vy, r, lo, hi)
        ctx.stroke()
      }
    }

    if (isSelected) ctx.strokeStyle = baseStyle
  }
}

// ---------------------------------------------------------------------------
// Subdivision and merge helpers
// ---------------------------------------------------------------------------

export function subdivideSquareTruchetShapes(shapes, idx) {
  const tile = shapes[idx]
  if (!tile) return false
  const [pts, meta] = tile
  if (!meta?.squareTruchet) return false

  const childSize = meta.size === 'large' ? 'medium' : meta.size === 'medium' ? 'small' : null
  if (!childSize) return false

  const pg = sqKey(pts)
  const parentInfo = {
    parentGroup: meta.parentGroup, parentVerts: meta.parentVerts,
    parentSize: meta.parentSize,
  }

  const newTiles = splitSquare(pts).map(({ pts: cPts }) => {
    const arcCount = ARC_COUNT[childSize]
    const aCount   = arcCount - 2
    return [cPts, {
      squareTruchet: true,
      startPt: Math.floor(Math.random() * 4),
      arcCount,
      lineSpacing: meta.lineSpacing,
      size: childSize,
      boundary: false,
      arcSetA: makeArcSet(aCount, false),
      arcSetB: makeArcSet(aCount, false),
      arcSetC: makeArcSet(aCount, false),
      arcSetD: makeArcSet(Math.min(2, aCount), false),
      parentGroup: pg,
      parentVerts: pts,
      parentSize: meta.size,
      _parentInfo: parentInfo,
    }]
  })

  shapes.splice(idx, 1, ...newTiles)
  shapes.forEach((s, i) => { if (s[1]) s[1]._idx = i })
  return true
}

export function canMergeSquareTruchetShapes(shapes, idx) {
  const tile = shapes[idx]
  if (!tile) return false
  const [, meta] = tile
  if (!meta?.parentGroup || !meta?.parentVerts || !meta?.parentSize) return false
  const siblings = shapes.filter(s => s[1]?.parentGroup === meta.parentGroup)
  return siblings.length === 4 && siblings.every(s => s[1].size === meta.size)
}

export function mergeSquareTruchetShapes(shapes, idx) {
  if (!canMergeSquareTruchetShapes(shapes, idx)) return -1

  const [, meta] = shapes[idx]
  const { parentGroup, parentVerts, parentSize, _parentInfo } = meta

  const siblingIndices = shapes
    .map((s, i) => s[1]?.parentGroup === parentGroup ? i : -1)
    .filter(i => i >= 0)
    .sort((a, b) => a - b)

  const arcCount = ARC_COUNT[parentSize]
  const aCount   = arcCount - 2
  const parentTile = [parentVerts, {
    squareTruchet: true,
    startPt: Math.floor(Math.random() * 4),
    arcCount,
    lineSpacing: meta.lineSpacing,
    size: parentSize,
    boundary: false,
    arcSetA: makeArcSet(aCount, false),
    arcSetB: makeArcSet(aCount, false),
    arcSetC: makeArcSet(aCount, false),
    arcSetD: makeArcSet(Math.min(2, aCount), false),
    ...(_parentInfo?.parentGroup ? {
      parentGroup:  _parentInfo.parentGroup,
      parentVerts:  _parentInfo.parentVerts,
      parentSize:   _parentInfo.parentSize,
    } : {}),
  }]

  const insertAt = siblingIndices[0]
  for (let i = siblingIndices.length - 1; i >= 0; i--) shapes.splice(siblingIndices[i], 1)
  shapes.splice(insertAt, 0, parentTile)
  shapes.forEach((s, i) => { if (s[1]) s[1]._idx = i })
  return insertAt
}
