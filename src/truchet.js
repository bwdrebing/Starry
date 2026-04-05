// Triangular Truchet tiles.
//
// Six equilateral triangles are arranged in a hexagonal star.  Each triangle
// is independently assigned a density (large / medium / small) and a random
// "top" vertex A.  Concentric arcs are drawn from A edge-to-edge, then from
// vertex B clipped where they would pass behind A's disc.  Vertex C is left
// empty, creating the stacked-disc occlusion illusion with only stroked lines.

const SIN60 = Math.sin(Math.PI / 3)  // √3/2

// Arc angle ranges [startAngle, endAngle] for each [orient][vertexIndex].
// Each arc spans the 60° interior angle at that vertex, pointing inward.
// Angles are clockwise from positive-X (matching canvas Y-down coordinates).
const ARC_ANGLES = [
  // orient 0 — upward-pointing (▲): v0=bottom-left, v1=bottom-right, v2=top
  [
    [5 * Math.PI / 3, 2 * Math.PI],    // v0: 300 → 360°
    [Math.PI,         4 * Math.PI / 3], // v1: 180 → 240°
    [Math.PI / 3,     2 * Math.PI / 3], // v2:  60 → 120°
  ],
  // orient 1 — downward-pointing (▽): v0=top-left, v1=top-right, v2=bottom
  [
    [0,               Math.PI / 3],     // v0:   0 →  60°
    [2 * Math.PI / 3, Math.PI],         // v1: 120 → 180°
    [4 * Math.PI / 3, 5 * Math.PI / 3], // v2: 240 → 300°
  ],
]

// Arc counts per size class (= n − 2, where n is control points per edge).
// Because each subdivision halves the edge length and the denominator (n−1)
// also halves, all three classes share the same absolute lineSpacing:
//   large : triBase   / 16  (n=17, arcCount=15)
//   medium: triBase/2 /  8  (n= 9, arcCount= 7) — same spacing
//   small : triBase/4 /  4  (n= 5, arcCount= 3) — same spacing
// arcCount drives aCount = arcCount - 2 arcs per vertex.
// small: max 3 arcs → aCount=3 → arcCount=5
// medium: max 6 arcs → aCount=6 → arcCount=8
// large: max 13 arcs → aCount=13 → arcCount=15
const ARC_COUNT = { large: 15, medium: 8, small: 5 }

// ---------------------------------------------------------------------------
// Clipping helper
// ---------------------------------------------------------------------------

// Returns the sub-arc of [a1, a2] (drawn clockwise) that lies OUTSIDE the
// disc (discCenter, discR), or null if the arc is entirely inside.
//
// Derivation: a point P = arcCenter + arcR·(cosθ, sinθ) on the arc is
// outside the disc when |P − discCenter|² > discR², which reduces to
//   d · cos(θ − φ) > K′
// where φ = atan2(arcCenter − discCenter), K′ = (R² − d² − r²) / (2r).
function clipArcOutsideDisc(arcCenter, arcR, a1, a2, discCenter, discR) {
  const dx = arcCenter[0] - discCenter[0]
  const dy = arcCenter[1] - discCenter[1]
  const d  = Math.hypot(dx, dy)
  if (d < 1e-10) return null

  const Kp    = (discR * discR - d * d - arcR * arcR) / (2 * arcR)
  const ratio = Kp / d

  if (ratio >=  1 - 1e-9) return null       // arc entirely inside disc
  if (ratio <= -1 + 1e-9) return [a1, a2]  // arc entirely outside disc

  const phi   = Math.atan2(dy, dx)
  const alpha = Math.acos(Math.max(-1, Math.min(1, ratio)))

  // As θ increases: tEnter is where the arc exits the disc (inside→outside),
  //                 tExit  is where the arc re-enters the disc (outside→inside).
  const tEnter = phi - alpha
  const tExit  = phi + alpha

  // Normalise a crossing angle into [a1, a1 + 2π)
  const TAU  = 2 * Math.PI
  const norm = t => { const dt = (((t - a1) % TAU) + TAU) % TAU; return a1 + dt }

  const nEnter  = norm(tEnter)
  const nExit   = norm(tExit)
  const enterIn = nEnter < a2
  const exitIn  = nExit  < a2

  if (!enterIn && !exitIn) {
    // No crossings in arc range — check midpoint
    const mid = (a1 + a2) / 2
    const ex  = arcCenter[0] + arcR * Math.cos(mid) - discCenter[0]
    const ey  = arcCenter[1] + arcR * Math.sin(mid) - discCenter[1]
    return Math.hypot(ex, ey) > discR ? [a1, a2] : null
  }
  if ( enterIn && !exitIn) return [nEnter, a2]   // outside from nEnter → end
  if (!enterIn &&  exitIn) return [a1, nExit]    // outside from start → nExit
  return [nEnter, nExit]                          // outside window in the middle
}

// ---------------------------------------------------------------------------
// Tiling generation
// ---------------------------------------------------------------------------

// Split one triangle into four by midpoint subdivision.
// The three corner sub-triangles keep the same orientation; the centre one flips.
function splitTri(pts, orient) {
  const [p0, p1, p2] = pts
  const m01 = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2]
  const m02 = [(p0[0]+p2[0])/2, (p0[1]+p2[1])/2]
  const m12 = [(p2[0]+p1[0])/2, (p2[1]+p1[1])/2]
  return [
    { pts: [p0,  m01, m02], orient },
    { pts: [m01, p1,  m12], orient },
    { pts: [m02, m12, p2 ], orient },
    { pts: [m02, m12, m01], orient: (orient + 1) % 2 },  // centre flips
  ]
}

// Stable string key for an edge, order-independent.
function edgeKey(p1, p2) {
  const ax = Math.round(p1[0] * 100), ay = Math.round(p1[1] * 100)
  const bx = Math.round(p2[0] * 100), by = Math.round(p2[1] * 100)
  return ax < bx || (ax === bx && ay < by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`
}

// Generate a full-canvas triangular grid targeting ~40 large triangles.
// triBase is chosen so that W*H ≈ 20 * triBase² * SIN60, giving ~40 tiles.
// Boundary triangles (with an exposed edge) are never subdivided; their A
// vertex is always the interior one and B/C arcs are suppressed in drawing.
// Some interior large triangles are subdivided into 4 medium each, and some
// of those medium triangles into 4 small each.
// All sizes share lineSpacing = triBase/16 so arcs align at shared edges.
export function generateTruchetTiling(W, H) {
  const triBase     = Math.sqrt(W * H / (20 * SIN60))
  const triH        = SIN60 * triBase
  const lineSpacing = triBase / 16

  const halfW = W / 2
  const halfH = H / 2
  const nRows = Math.ceil(halfH / triH) + 1
  const nCols = Math.ceil(halfW / triBase) + 1

  // Build the large-triangle grid.  Alternate rows are offset by triBase/2.
  // orient 0 (▲): v0=BL, v1=BR, v2=top   — centroid at (x0+triBase/2, y0-triH/3)
  // orient 1 (▽): v0=TL, v1=TR, v2=bottom — centroid at (x1,           y1+triH/3)
  const largeTris = []
  for (let r = -nRows; r <= nRows; r++) {
    const y0   = r * triH
    const y1   = (r - 1) * triH
    const xOff = (((r % 2) + 2) % 2) * (triBase / 2)

    for (let c = -nCols; c <= nCols; c++) {
      const x0   = c * triBase + xOff
      const x1   = x0 + triBase
      const xMid = x0 + triBase / 2

      if (Math.abs(x0 + triBase / 2) <= halfW && Math.abs(y0 - triH / 3) <= halfH)
        largeTris.push({ pts: [[x0, y0], [x1, y0], [xMid, y1]], orient: 0 })

      if (Math.abs(x1) <= halfW && Math.abs(y1 + triH / 3) <= halfH)
        largeTris.push({ pts: [[xMid, y1], [xMid + triBase, y1], [x1, y0]], orient: 1 })
    }
  }

  // Build edge-sharing map; edges that appear only once are exposed (boundary).
  const edgeMap = new Map()
  largeTris.forEach((tri, ti) => {
    for (let ei = 0; ei < 3; ei++) {
      const key = edgeKey(tri.pts[ei], tri.pts[(ei + 1) % 3])
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key).push({ ti, ei })
    }
  })

  // Mark each large triangle as boundary (has an exposed edge) and record
  // which edge index is exposed (used to fix A = interior vertex).
  largeTris.forEach(tri => {
    tri.boundary    = false
    tri.exposedEdge = -1
    for (let ei = 0; ei < 3; ei++) {
      const key = edgeKey(tri.pts[ei], tri.pts[(ei + 1) % 3])
      if (edgeMap.get(key).length === 1) {
        tri.boundary    = true
        tri.exposedEdge = ei
        break
      }
    }
  })

  // Build set of vertices that sit on an exposed edge (boundary vertices).
  // Only the two vertices of each exposed edge are included — NOT the interior
  // vertex of the boundary triangle — so adjacency detection is precise.
  function vKey(p) { return `${Math.round(p[0]*100)},${Math.round(p[1]*100)}` }
  const boundaryVerts = new Set()
  largeTris.forEach(tri => {
    if (!tri.boundary) return
    const ei = tri.exposedEdge
    boundaryVerts.add(vKey(tri.pts[ei]))
    boundaryVerts.add(vKey(tri.pts[(ei + 1) % 3]))
  })

  // Fisher-Yates shuffle of an array (in-place), returns it.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  // Subdivide ~30% of interior large triangles into 4 medium each.
  const interiorIdx = largeTris.flatMap((tri, i) => tri.boundary ? [] : [i])
  const nSplitL     = Math.max(2, Math.round(largeTris.length * 0.3))
  const splitL      = new Set(shuffle(interiorIdx).slice(0, Math.min(nSplitL, interiorIdx.length)))

  const medTris = []
  const result  = []

  largeTris.forEach((tri, i) => {
    if (splitL.has(i)) {
      medTris.push(...splitTri(tri.pts, tri.orient))
    } else {
      // For non-boundary triangles: check if exactly one vertex is on a boundary
      // edge of the tiling.  If so, that vertex must be C (suppress its arcs).
      let cornerVIdx = -1
      if (!tri.boundary) {
        let count = 0
        tri.pts.forEach((p, vi) => { if (boundaryVerts.has(vKey(p))) { count++; cornerVIdx = vi } })
        if (count !== 1) cornerVIdx = -1   // only act on the unambiguous case
      }
      result.push({ pts: tri.pts, orient: tri.orient, size: 'large',
                    boundary: tri.boundary, exposedEdge: tri.exposedEdge, cornerVIdx })
    }
  })

  // Subdivide ~25% of medium triangles into 4 small each.
  // Medium triangles are always interior (born from non-boundary large splits).
  const nSplitM = Math.max(1, Math.round(medTris.length * 0.25))
  const splitM  = new Set(shuffle(medTris.map((_, i) => i)).slice(0, nSplitM))

  medTris.forEach((tri, i) => {
    if (splitM.has(i))
      splitTri(tri.pts, tri.orient).forEach(child => result.push({ ...child, size: 'small' }))
    else
      result.push({ ...tri, size: 'medium' })
  })

  return result.map(({ pts, orient, size, boundary, exposedEdge, cornerVIdx }, i) => {
    const arcCount  = ARC_COUNT[size]
    const aCount    = arcCount - 2
    const startPt   = boundary        ? (exposedEdge + 2) % 3
                    : cornerVIdx >= 0 ? (cornerVIdx  + 1) % 3
                    :                   Math.floor(Math.random() * 3)
    const isBoundary = !!boundary
    const isCorner   = cornerVIdx >= 0 && !boundary
    return [pts, {
      truchet:   true,
      orient,    startPt, arcCount, lineSpacing,
      boundary:  isBoundary,
      suppressA: false,
      suppressB: isBoundary,
      suppressC: isBoundary || isCorner,
      arcRangeA: [1, aCount],
      arcRangeB: [1, aCount],
      arcRangeC: [1, Math.min(3, aCount)],
      _idx:      i,
    }]
  })
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

// Convert a canvas clockwise arc to an SVG path string.
function arcToSVGPath(cx, cy, r, a1, a2) {
  const f  = n => n.toFixed(4)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const x2 = cx + r * Math.cos(a2)
  const y2 = cy + r * Math.sin(a2)
  const largeArc = (a2 - a1) > Math.PI ? 1 : 0
  return `M${f(x1)},${f(y1)} A${f(r)},${f(r)},0,${largeArc},1,${f(x2)},${f(y2)}`
}

// Returns an array of SVG path strings for all Truchet arcs in `shapes`,
// applying the same disc-clipping logic as drawTruchetShapes.
export function getTruchetPaths(shapes) {
  const paths = []
  for (const [pts, meta] of shapes) {
    if (!meta?.truchet) continue
    const { orient, startPt, arcCount, lineSpacing,
            suppressA, suppressB, suppressC,
            arcRangeA, arcRangeB, arcRangeC } = meta
    const aCount  = arcCount - 2
    const [rA0, rA1] = arcRangeA ?? [1, aCount]
    const [rB0, rB1] = arcRangeB ?? [1, aCount]
    const [rC0, rC1] = arcRangeC ?? [1, Math.min(3, aCount)]

    const vA     = pts[(startPt + 0) % 3]
    const vB     = pts[(startPt + 1) % 3]
    const discR_A = suppressA ? 0 : rA1 * lineSpacing
    const discR_B = suppressB ? 0 : rB1 * lineSpacing

    // ── Vertex A ─────────────────────────────────────────────────────────────
    if (!suppressA) {
      const vi       = (startPt + 0) % 3
      const [vx, vy] = vA
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = rA0; k <= rA1; k++)
        paths.push(arcToSVGPath(vx, vy, k * lineSpacing, a1, a2))
    }

    const dEdge = Math.hypot(vB[0] - vA[0], vB[1] - vA[1])

    // ── Vertex B: clipped outside A's disc ───────────────────────────────────
    if (!suppressB) {
      const vi       = (startPt + 1) % 3
      const [vx, vy] = vB
      const [a1, a2] = ARC_ANGLES[orient][vi]
      const doClip   = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      for (let k = rB0; k <= rB1; k++) {
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

    // ── Vertex C: clipped outside both A's and B's discs ─────────────────────
    if (!suppressC) {
      const vi       = (startPt + 2) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      const doClipA  = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      const doClipB  = discR_B > 1e-6 && discR_B < dEdge - 1e-6
      for (let k = rC0; k <= rC1; k++) {
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
  }
  return paths
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Colors for vertex A / B / C when a tile is selected — shared with the UI.
export const VERTEX_COLORS = [
  'rgba(255, 110, 110, 0.95)',   // A — coral red
  'rgba(255, 200,  50, 0.95)',   // B — gold
  'rgba( 70, 190, 255, 0.95)',   // C — sky blue
]

export function drawTruchetShapes(ctx, shapes, selectedIdx = -1) {
  const baseStyle = ctx.strokeStyle   // caller's white stroke; restored per-vertex
  for (const [pts, meta] of shapes) {
    if (!meta?.truchet) continue
    const { orient, startPt, arcCount, lineSpacing,
            suppressA, suppressB, suppressC,
            arcRangeA, arcRangeB, arcRangeC } = meta
    const aCount     = arcCount - 2
    const isSelected = selectedIdx >= 0 && meta._idx === selectedIdx

    const [rA0, rA1] = arcRangeA ?? [1, aCount]
    const [rB0, rB1] = arcRangeB ?? [1, aCount]
    const [rC0, rC1] = arcRangeC ?? [1, Math.min(3, aCount)]

    const vA = pts[(startPt + 0) % 3]
    const vB = pts[(startPt + 1) % 3]

    // Disc radii for occlusion: based on each vertex's actual outermost drawn arc.
    // If a vertex is suppressed its disc collapses to 0 so the next vertex draws freely.
    const discR_A = suppressA ? 0 : rA1 * lineSpacing
    const discR_B = suppressB ? 0 : rB1 * lineSpacing

    ctx.lineCap = 'round'

    // ── Vertex A: full arcs, edge to edge ────────────────────────────────────
    if (!suppressA) {
      ctx.strokeStyle = isSelected ? VERTEX_COLORS[0] : baseStyle
      const vi       = (startPt + 0) % 3
      const [vx, vy] = vA
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = rA0; k <= rA1; k++) {
        ctx.beginPath()
        ctx.arc(vx, vy, k * lineSpacing, a1, a2)
        ctx.stroke()
      }
    }

    // Edge length is uniform across equilateral triangles — compute once.
    const dEdge = Math.hypot(vB[0] - vA[0], vB[1] - vA[1])

    // ── Vertex B: clipped outside A's disc ───────────────────────────────────
    if (!suppressB) {
      ctx.strokeStyle = isSelected ? VERTEX_COLORS[1] : baseStyle
      const vi       = (startPt + 1) % 3
      const [vx, vy] = vB
      const [a1, a2] = ARC_ANGLES[orient][vi]
      const doClip   = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      for (let k = rB0; k <= rB1; k++) {
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

    // ── Vertex C: clipped outside both A's and B's discs ─────────────────────
    if (!suppressC) {
      ctx.strokeStyle = isSelected ? VERTEX_COLORS[2] : baseStyle
      const vi       = (startPt + 2) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      const doClipA  = discR_A > 1e-6 && discR_A < dEdge - 1e-6
      const doClipB  = discR_B > 1e-6 && discR_B < dEdge - 1e-6
      for (let k = rC0; k <= rC1; k++) {
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

    // Restore base style after selected tile so subsequent tiles draw normally.
    if (isSelected) ctx.strokeStyle = baseStyle
  }
}
