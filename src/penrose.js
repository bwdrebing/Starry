// Penrose P3 rhombus tiling via de Bruijn's multigrid method.
//
// Algorithm: draw 5 families of equally-spaced parallel lines at angles
// k * 72° (k = 0..4).  At each pairwise intersection, compute a dual
// polygon whose vertices are determined by which "level set" band each
// offset sample falls in.  The dual polygons tile the plane with two
// rhombus shapes: thick (72°) and thin (36°).
//
// Reference: Aatish Bhatia – Pattern Collider (github.com/aatishb/patterncollider)
// de Bruijn, N. G. (1981). "Algebraic theory of Penrose's non-periodic tilings."

export function generatePenrose(width, height, steps = 7) {
  const symmetry = 5
  const multiplier = 2 * Math.PI / symmetry   // 72° in radians
  const epsilon    = 1e-6
  const eps2       = 1e-3                       // offset used for dual computation

  // Slightly irrational offsets per family to avoid 3-or-more-line coincidences.
  const offsets = [0, 0.1, 0.2, 0.3, 0.4]

  // Scale from dual-space units → canvas pixels.
  // Matches Pattern Collider: preFactor = min(W,H)/steps * (2π/symmetry) / π
  const scale = 2 * Math.min(width, height) / (steps * symmetry)

  // sin/cos lookup (indexed by family 0..4)
  const sc = Array.from({ length: symmetry }, (_, i) => ({
    sin: Math.sin(i * multiplier),
    cos: Math.cos(i * multiplier),
  }))

  const round3 = x => Math.round(x * 1000) / 1000

  // ── 1. Build grid lines ────────────────────────────────────────────────
  // Each line: { family: i, index: n + offsets[i] }
  // Line equation: x * cos(i*mult) + y * sin(i*mult) = index
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

      // Determinant of the 2×2 system
      const s12 = s1 * c2 - c1 * s2
      if (Math.abs(s12) < epsilon) continue

      const x = (l2.index * s1 - l1.index * s2) / s12
      const y = (l2.index * c1 - l1.index * c2) / -s12

      // Only keep intersections within a bounding circle
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
    // All edge directions at this intersection (both ways)
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

    // Project each median point into dual space (sum of level-set coords)
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

    // Determine thick vs thin by which families intersect.
    // Families 1 step apart (mod 5) → thick rhombus (72° angle).
    // Families 2 steps apart       → thin  rhombus (36° angle).
    const families = [...new Set(pt.lines.map(l => l.family))]
    const diff = families.length === 2
      ? Math.min(
          Math.abs(families[0] - families[1]),
          symmetry - Math.abs(families[0] - families[1])
        )
      : 1
    const thick = diff === 1

    shapes.push([dualPts, { penrose: true, thick }])
  }

  return shapes
}
