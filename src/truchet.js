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
const ARC_COUNT = { large: 15, medium: 7, small: 3 }

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
      result.push({ pts: tri.pts, orient: tri.orient, size: 'large',
                    boundary: tri.boundary, exposedEdge: tri.exposedEdge })
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

  return result.map(({ pts, orient, size, boundary, exposedEdge }) => {
    const arcCount = ARC_COUNT[size]
    // Boundary triangles: A must be the interior vertex (not on the exposed edge).
    // Edge ei connects pts[ei] and pts[(ei+1)%3], so the interior vertex is (ei+2)%3.
    const startPt  = boundary ? (exposedEdge + 2) % 3 : Math.floor(Math.random() * 3)
    return [pts, { truchet: true, orient, startPt, arcCount, lineSpacing, boundary: !!boundary }]
  })
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Draw truchet arcs.  The caller must set ctx.strokeStyle and ctx.lineWidth
// before calling (use the same values as Hankin lines).
export function drawTruchetShapes(ctx, shapes) {
  for (const [pts, meta] of shapes) {
    if (!meta?.truchet) continue
    const { orient, startPt, arcCount, lineSpacing, boundary } = meta

    ctx.lineCap = 'round'

    // A's disc radius = outermost arc circle, used to clip B
    const aCount = arcCount - 2
    const discR  = aCount * lineSpacing
    const vA     = pts[(startPt + 0) % 3]

    // ── Vertex A: full arcs, edge to edge (k=1 to arcCount-2) ─────────────
    {
      const vi       = (startPt + 0) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = 1; k <= aCount; k++) {
        ctx.beginPath()
        ctx.arc(vx, vy, k * lineSpacing, a1, a2)
        ctx.stroke()
      }
    }

    // ── Vertex B: same arc count as A, clipped at A's disc ────────────────
    if (!boundary) {
      const vi       = (startPt + 1) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = 1; k <= aCount; k++) {
        const r       = k * lineSpacing
        const clipped = clipArcOutsideDisc([vx, vy], r, a1, a2, vA, discR)
        if (!clipped) continue
        const [da1, da2] = clipped
        if (da2 - da1 < 1e-6) continue
        ctx.beginPath()
        ctx.arc(vx, vy, r, da1, da2)
        ctx.stroke()
      }
    }

    // ── Vertex C: first 3 arcs only ────────────────────────────────────────
    if (!boundary) {
      const vi       = (startPt + 2) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath()
        ctx.arc(vx, vy, k * lineSpacing, a1, a2)
        ctx.stroke()
      }
    }
  }
}
