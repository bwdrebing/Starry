// Triangular Truchet tiles — ported and adapted from a Processing/Python sketch.
//
// The pattern is built from equilateral triangles arranged in a hexagonal grid.
// Each triangle is recursively subdivided and assigned concentric arc segments
// drawn from each vertex.  The arc fill (using the background colour) creates
// the classic truchet weave where arcs from different vertices appear to
// interleave.

const COS30 = Math.cos(Math.PI / 6)  // √3/2 ≈ 0.866
const SIN60 = Math.sin(Math.PI / 3)  // √3/2 ≈ 0.866

// Arc angle ranges [startAngle, endAngle] indexed by [orient][vertexIndex].
// Angles are measured clockwise from the positive-X axis, matching the canvas
// coordinate system (Y increases downward).  Each arc spans exactly 60° — the
// interior angle of an equilateral triangle — and is centred on the bisector
// pointing into the triangle interior from that vertex.
const ARC_ANGLES = [
  // orient 0 — upward-pointing triangle (▲)
  //   vertex 0 = bottom-left, vertex 1 = bottom-right, vertex 2 = top
  [
    [5 * Math.PI / 3, 2 * Math.PI],   // v0: 300 → 360°
    [Math.PI,         4 * Math.PI / 3], // v1: 180 → 240°
    [Math.PI / 3,     2 * Math.PI / 3], // v2:  60 → 120°
  ],
  // orient 1 — downward-pointing triangle (▽)
  //   vertex 0 = top-left, vertex 1 = top-right, vertex 2 = bottom
  [
    [0,               Math.PI / 3],     // v0:   0 →  60°
    [2 * Math.PI / 3, Math.PI],         // v1: 120 → 180°
    [4 * Math.PI / 3, 5 * Math.PI / 3], // v2: 240 → 300°
  ],
]

// Split one triangle into four (classic midpoint subdivision).
// The inner centre triangle flips orientation.
function splitTri({ pts, orient, lineCount }) {
  const [p0, p1, p2] = pts
  const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  const m02 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]
  const m12 = [(p2[0] + p1[0]) / 2, (p2[1] + p1[1]) / 2]
  const lc = lineCount / 2
  return [
    { pts: [p0,  m01, m02], orient,              lineCount: lc },
    { pts: [m01, p1,  m12], orient,              lineCount: lc },
    { pts: [m02, m12, p2 ], orient,              lineCount: lc },
    { pts: [m02, m12, m01], orient: (orient + 1) % 2, lineCount: lc },
  ]
}



// Generate the full triangular truchet tiling centred at the canvas origin.
// Returns an array of Starry shape pairs: [vertices, metadata].
// All random parameters are pre-computed here so drawTruchetShapes is stable.
export function generateTruchetTiling(W, H) {
  const size    = Math.min(W, H)
  const border  = size * 0.075
  const triBase = (size - 2 * border) / 2
  const triH    = SIN60 * triBase
  // Use simpler parameters for small canvases (thumbnail previews)
  const small   = size < 200

  const maxRecurs   = small ? 2 : 2 + Math.floor(Math.random() * 4)
  const minRecurs   = small ? 0 : Math.floor(Math.random() * 2)
  const splitChance = small ? 50 : 10 + Math.floor(Math.random() * 70)

  let minLines
  if      (maxRecurs === 5) minLines = 2
  else if (maxRecurs === 4) minLines = 3 + (small ? 0 : Math.floor(Math.random() * 2))
  else if (maxRecurs === 3) minLines = 3 + (small ? 0 : Math.floor(Math.random() * 3))
  else                       minLines = 3 + (small ? 1 : Math.floor(Math.random() * 4))

  const maxLines    = (2 ** maxRecurs * minLines) | 0
  const lineSpacing = (size - 2 * border) / 2 / maxLines
  const weight      = lineSpacing / 2

  // Six initial equilateral triangles forming a hexagonal star, centred at origin
  const sx = -triBase, sy = 0
  let tri = [
    { pts: [[sx,             sy         ], [sx + triBase,         sy          ], [sx + triBase / 2,      -triH]], orient: 0, lineCount: maxLines },
    { pts: [[sx + triBase / 2, -triH    ], [sx + 3 * triBase / 2, -triH       ], [sx + triBase,          sy  ]], orient: 1, lineCount: maxLines },
    { pts: [[sx + triBase,   sy         ], [sx + 2 * triBase,     sy          ], [sx + 3 * triBase / 2, -triH]], orient: 0, lineCount: maxLines },
    { pts: [[sx,             sy         ], [sx + triBase,         sy          ], [sx + triBase / 2,       triH]], orient: 1, lineCount: maxLines },
    { pts: [[sx + triBase / 2, triH     ], [sx + 3 * triBase / 2,  triH      ], [sx + triBase,          sy  ]], orient: 0, lineCount: maxLines },
    { pts: [[sx + triBase,   sy         ], [sx + 2 * triBase,     sy          ], [sx + 3 * triBase / 2,  triH]], orient: 1, lineCount: maxLines },
  ]

  const finalTri = []

  // Recursive subdivision — replicates the original Processing logic faithfully,
  // including the "double split" behaviour when i < minRecurs.
  for (let i = 0; i < maxRecurs; i++) {
    const holder = []
    if (i < minRecurs) {
      for (const t of tri) for (const nt of splitTri(t)) holder.push(nt)
    }
    for (const t of tri) {
      if (Math.random() * 100 < splitChance) {
        for (const nt of splitTri(t)) holder.push(nt)
      } else {
        finalTri.push(t)
      }
    }
    tri = holder
  }
  for (const t of tri) finalTri.push(t)

  // Pre-compute the random arc parameters for each triangle so that
  // repeated draw() calls produce a stable image.
  return finalTri.map(({ pts, orient, lineCount }) => {
    const edgeLen = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])

    // Maximum number of concentric arcs that fit inside the triangle
    let n = Math.floor(COS30 * lineCount)
    if (n * lineSpacing + weight / 1.2 >= COS30 * edgeLen) n = Math.max(0, n - 1)

    // Random split between two arc counts that must sum to lineCount (±1)
    const m     = lineCount - n
    const range = Math.max(1, n - m + 1)
    let   p1    = m + Math.floor(Math.random() * range)
    let   p2    = lineCount - p1
    if      (p1 < p2) p1 += 1
    else if (p2 < p1) p2 += 1

    const startPt = Math.floor(Math.random() * 3)

    return [
      pts,
      { truchet: true, orient, lineSpacing, weight, n, arcCount3: Math.min(p1, p2), startPt },
    ]
  })
}

// Clip arc [a1, a2] (drawn clockwise) to only the portion OUTSIDE the disc
// defined by (discCenter, discR).  arcCenter / arcR define the arc circle.
//
// A point on the arc at angle θ lies outside the disc when:
//   d · cos(θ − φ) > K′   where φ = atan2(arcCenter−discCenter), K′ = (R²−d²−r²)/(2r)
//
// Returns null (entirely inside), [a1, a2] (entirely outside),
// or a clipped [start, end] sub-arc.
function clipArcOutsideDisc(arcCenter, arcR, a1, a2, discCenter, discR) {
  const dx = arcCenter[0] - discCenter[0]
  const dy = arcCenter[1] - discCenter[1]
  const d  = Math.hypot(dx, dy)
  if (d < 1e-10) return null

  const Kp    = (discR * discR - d * d - arcR * arcR) / (2 * arcR)
  const ratio = Kp / d

  if (ratio >=  1 - 1e-9) return null        // arc entirely inside disc
  if (ratio <= -1 + 1e-9) return [a1, a2]   // arc entirely outside disc

  const phi   = Math.atan2(dy, dx)
  const alpha = Math.acos(Math.max(-1, Math.min(1, ratio)))

  // tEnter: angle at which the arc crosses FROM inside → outside (as θ increases)
  // tExit:  angle at which the arc crosses FROM outside → inside
  const tEnter = phi - alpha
  const tExit  = phi + alpha

  // Normalise a crossing angle to [a1, a1 + 2π)
  const TAU  = 2 * Math.PI
  const norm = t => { const dt = (((t - a1) % TAU) + TAU) % TAU; return a1 + dt }

  const nEnter = norm(tEnter)
  const nExit  = norm(tExit)
  const enterIn = nEnter < a2
  const exitIn  = nExit  < a2

  if (!enterIn && !exitIn) {
    // No crossings inside the arc range — check the midpoint
    const mid = (a1 + a2) / 2
    const ex  = arcCenter[0] + arcR * Math.cos(mid) - discCenter[0]
    const ey  = arcCenter[1] + arcR * Math.sin(mid) - discCenter[1]
    return Math.hypot(ex, ey) > discR ? [a1, a2] : null
  }
  if ( enterIn && !exitIn) return [nEnter, a2]    // outside from nEnter → end
  if (!enterIn &&  exitIn) return [a1, nExit]      // outside from start → nExit
  return [nEnter, nExit]                            // outside in the middle
}

// Draw all truchet shapes onto ctx as stroked arcs only — no fills.
// Stacking order: vertex i=0 is the "top" disc (arcs drawn in full, edge to
// edge).  Vertex i=1 is clipped at i=0's disc boundary.  Vertex i=2 is
// clipped at i=1's disc boundary.  This produces the stacked-disc occlusion
// illusion with just line strokes, matching the Hankin motif style.
export function drawTruchetShapes(ctx, shapes, strokeColor = 'rgba(255,255,255,0.85)') {
  for (const [pts, meta] of shapes) {
    if (!meta?.truchet) continue
    const { orient, lineSpacing, weight, n, arcCount3, startPt } = meta

    ctx.lineWidth   = weight
    ctx.lineCap     = 'round'
    ctx.strokeStyle = strokeColor

    // Outer-arc disc radius (same for vertex i=0 and i=1, both have n arcs)
    const discR = n * lineSpacing

    for (let i = 0; i < 3; i++) {
      const vi       = (startPt + i) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      const count    = i < 2 ? n : arcCount3

      // Which earlier vertex's disc occludes this one?
      const clipPt = i === 1 ? pts[(startPt + 0) % 3]
                   : i === 2 ? pts[(startPt + 1) % 3]
                   : null  // i===0: top disc, draw fully

      for (let j = 0; j < count; j++) {
        const r = (count - j) * lineSpacing

        let da1 = a1, da2 = a2
        if (clipPt !== null) {
          const clipped = clipArcOutsideDisc([vx, vy], r, a1, a2, clipPt, discR)
          if (clipped === null) continue
          ;[da1, da2] = clipped
        }
        if (da2 - da1 < 1e-6) continue

        ctx.beginPath()
        ctx.arc(vx, vy, r, da1, da2)
        ctx.stroke()
      }

      // Dot at the vertex
      ctx.beginPath()
      ctx.arc(vx, vy, weight / 2, 0, 2 * Math.PI)
      ctx.fillStyle = strokeColor
      ctx.fill()
    }
  }
}
