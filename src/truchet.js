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

// Number of control points per edge (including the two corner endpoints)
// for each size class.  Arc count per vertex = n − 2 (skip the corners).
const SIZES = { large: 17, medium: 9, small: 5 }
const SIZE_KEYS = Object.keys(SIZES)

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

// Generate the six triangles with pre-computed arc metadata.
// Caller is responsible for setting ctx stroke style before drawing.
export function generateTruchetTiling(W, H) {
  const size    = Math.min(W, H)
  const border  = size * 0.075
  const triBase = (size - 2 * border) / 2
  const triH    = SIN60 * triBase

  const sx = -triBase, sy = 0
  const base = [
    { pts: [[sx,            sy        ], [sx+triBase,         sy        ], [sx+triBase/2,      -triH]], orient: 0 },
    { pts: [[sx+triBase/2, -triH      ], [sx+3*triBase/2,    -triH      ], [sx+triBase,         sy  ]], orient: 1 },
    { pts: [[sx+triBase,   sy         ], [sx+2*triBase,       sy        ], [sx+3*triBase/2,    -triH]], orient: 0 },
    { pts: [[sx,            sy        ], [sx+triBase,         sy        ], [sx+triBase/2,       triH]], orient: 1 },
    { pts: [[sx+triBase/2,  triH      ], [sx+3*triBase/2,     triH      ], [sx+triBase,         sy  ]], orient: 0 },
    { pts: [[sx+triBase,   sy         ], [sx+2*triBase,       sy        ], [sx+3*triBase/2,     triH]], orient: 1 },
  ]

  return base.map(({ pts, orient }) => {
    const n           = SIZES[SIZE_KEYS[Math.floor(Math.random() * 3)]]
    const arcCount    = n - 2                  // number of arcs per vertex (skip corners)
    const lineSpacing = triBase / (n - 1)      // even spacing between control points
    const startPt     = Math.floor(Math.random() * 3)  // which vertex is A

    return [pts, { truchet: true, orient, startPt, arcCount, lineSpacing }]
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
    const { orient, startPt, arcCount, lineSpacing } = meta

    ctx.lineCap = 'round'

    // A's disc radius = outermost arc circle, used to clip B
    const discR = arcCount * lineSpacing
    const vA    = pts[(startPt + 0) % 3]

    // ── Vertex A: full arcs, edge to edge ──────────────────────────────────
    {
      const vi       = (startPt + 0) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = 1; k <= arcCount; k++) {
        ctx.beginPath()
        ctx.arc(vx, vy, k * lineSpacing, a1, a2)
        ctx.stroke()
      }
    }

    // ── Vertex B: arcs clipped at A's disc ─────────────────────────────────
    {
      const vi       = (startPt + 1) % 3
      const [vx, vy] = pts[vi]
      const [a1, a2] = ARC_ANGLES[orient][vi]
      for (let k = 1; k <= arcCount; k++) {
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

    // ── Vertex C: no arcs (the open gap that completes the illusion) ────────
  }
}
