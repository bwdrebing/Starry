// Quasi-periodic rhombus tilings via de Bruijn's multigrid method.
//
// Works for any n-fold rotational symmetry (5 = Penrose P3, 7 = heptagonal,
// 8 = Ammann-Beenker, etc.).  Draw n families of equally-spaced parallel lines
// at angles k * 2π/n.  At each pairwise intersection, project nearby sample
// points into the dual lattice to obtain rhombus vertices.
//
// Reference: Aatish Bhatia – Pattern Collider (github.com/aatishb/patterncollider)
// de Bruijn, N. G. (1981). "Algebraic theory of Penrose's non-periodic tilings."

export function generateMultigrid(width, height, symmetry = 5, steps) {
  // Default steps: keep tile density roughly constant across symmetries.
  if (steps === undefined) steps = Math.max(4, Math.round(40 / symmetry))

  const multiplier = 2 * Math.PI / symmetry
  const epsilon    = 1e-6
  const eps2       = 1e-3  // offset used in dual computation

  // Irrational-ish offsets per family (golden-ratio spacing) to prevent
  // three or more lines from coinciding at a single point.
  const phi = 0.6180339887  // 1/φ
  const offsets = Array.from({ length: symmetry }, (_, i) => (i * phi) % 1)

  // Scale from dual-space units → canvas pixels.
  // Matches Pattern Collider: preFactor = min(W,H)/steps × (2π/symmetry) / π
  const scale = 2 * Math.min(width, height) / (steps * symmetry)

  // sin/cos lookup (indexed by family)
  const sc = Array.from({ length: symmetry }, (_, i) => ({
    sin: Math.sin(i * multiplier),
    cos: Math.cos(i * multiplier),
  }))

  const round3 = x => Math.round(x * 1000) / 1000

  // ── 1. Build grid lines ────────────────────────────────────────────────
  // Line equation: x·cos(i·mult) + y·sin(i·mult) = index
  const grid = []
  for (let i = 0; i < symmetry; i++) {
    for (let n = -steps; n <= steps; n++) {
      grid.push({ family: i, index: n + offsets[i] })
    }
  }

  // ── 2. Find pairwise intersections (different families only) ──────────
  const pts = new Map()

  for (let p = 0; p < grid.length; p++) {
    for (let q = p + 1; q < grid.length; q++) {
      const l1 = grid[p], l2 = grid[q]
      if (l1.family === l2.family) continue

      const { sin: s1, cos: c1 } = sc[l1.family]
      const { sin: s2, cos: c2 } = sc[l2.family]

      const s12 = s1 * c2 - c1 * s2   // determinant
      if (Math.abs(s12) < epsilon) continue  // parallel families

      const x = (l2.index * s1 - l1.index * s2) /  s12
      const y = (l2.index * c1 - l1.index * c2) / -s12

      if (x * x + y * y > (steps + 1) ** 2) continue

      const key = `${round3(x)},${round3(y)}`
      if (!pts.has(key)) pts.set(key, { x, y, lines: [] })
      const pt = pts.get(key)
      if (!pt.lines.includes(l1)) pt.lines.push(l1)
      if (!pt.lines.includes(l2)) pt.lines.push(l2)
    }
  }

  // ── 3. Compute dual rhombus for each intersection ─────────────────────
  const shapes = []

  for (const pt of pts.values()) {
    // All edge directions at this intersection (both ways around)
    let angles = pt.lines.map(l => l.family * multiplier)
    let anglesOpp = angles.map(a => (a + Math.PI) % (2 * Math.PI))
    angles = [...angles, ...anglesOpp]
      .map(a => round3(a))
      .sort((a, b) => a - b)
      .filter((a, i, arr) => arr.indexOf(a) === i)

    // Offset slightly in each perpendicular direction from the intersection
    const offsetPts = angles.map(a => ({
      x: pt.x - eps2 * Math.sin(a),
      y: pt.y + eps2 * Math.cos(a),
    }))

    // Midpoints between consecutive offset points
    const N = offsetPts.length
    const medianPts = Array.from({ length: N }, (_, i) => ({
      x: (offsetPts[i].x + offsetPts[(i + 1) % N].x) / 2,
      y: (offsetPts[i].y + offsetPts[(i + 1) % N].y) / 2,
    }))

    // Project each median point into dual space
    const dualPts = medianPts.map(mp => {
      let xd = 0, yd = 0
      for (let i = 0; i < symmetry; i++) {
        const k = Math.floor(mp.x * sc[i].cos + mp.y * sc[i].sin - offsets[i])
        xd += k * sc[i].cos
        yd += k * sc[i].sin
      }
      return [xd * scale, yd * scale]
    })

    if (dualPts.length < 3) continue

    // Rhombus type: angular separation between the two line families.
    // diff=1 → most acute (e.g. 72° for n=5); higher diff → closer to square.
    const families = [...new Set(pt.lines.map(l => l.family))]
    const diff = families.length === 2
      ? Math.min(
          Math.abs(families[0] - families[1]),
          symmetry - Math.abs(families[0] - families[1])
        )
      : 1

    shapes.push([dualPts, { multigrid: true, diff }])
  }

  return shapes
}

// Convenience wrappers
export const generatePenrose  = (w, h) => generateMultigrid(w, h, 5)
export const generate7fold    = (w, h) => generateMultigrid(w, h, 7)
export const generate8fold    = (w, h) => generateMultigrid(w, h, 8)
