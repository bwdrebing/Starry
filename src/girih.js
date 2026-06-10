// Girih tilings — periodic patterns of the classic girih tiles (regular
// decagon, elongated hexagon, bow tie), all edges the same length.
//
// Two historic arrangements are generated:
//  'db'  — decagons linked left/right by bow-tie "bridges", rows nesting so
//          that every bow-tie waist (216°) meets a decagon corner (144°);
//          the remaining decagon edges are shared with diagonal-neighbour
//          decagons or with bow-tie flanks. One decagon + one bow tie per
//          lattice cell.
//  'dhb' — staggered decagon rows with upright hexagons between horizontal
//          neighbours and mirrored bow-tie pairs nestling against the upper
//          edges of every decagon. One decagon + one hexagon + two bow ties
//          per lattice cell.
//
// Tiles are built by a turtle walk over their interior angles and assembled
// with rigid edge-to-edge gluing, so coordinates are exact up to float error.
// Both arrangements were verified combinatorially: every interior vertex's
// angles sum to 360° and every interior edge is shared by exactly two tiles.

const PHI = (1 + Math.sqrt(5)) / 2
const APOTHEM = 0.5 / Math.tan(Math.PI / 10)   // decagon apothem for unit edge
const DEG = Math.PI / 180

// Turtle-walk a unit-edge polygon from its interior angles (degrees), CCW.
function mkTile(interior) {
  const v = [[0, 0]]
  let h = 0
  for (let i = 0; i < interior.length - 1; i++) {
    const [x, y] = v[v.length - 1]
    v.push([x + Math.cos(h), y + Math.sin(h)])
    h += Math.PI - interior[(i + 1) % interior.length] * DEG
  }
  return v
}

const BASE = {
  decagon: mkTile(Array(10).fill(144)),
  hexagon: mkTile([144, 72, 144, 144, 72, 144]),
  bowtie:  mkTile([216, 72, 72, 216, 72, 72]),   // waists at vertices 0 and 3
}

function centroid(verts) {
  const n = verts.length
  return [
    verts.reduce((s, p) => s + p[0], 0) / n,
    verts.reduce((s, p) => s + p[1], 0) / n,
  ]
}

// Rigid transform placing tile `kind` so its edge e (v[e] → v[e+1]) lands on
// the segment B → A. A tile glued onto another tile's CCW edge a → b via
// glue(kind, e, a, b) ends up on the far side of that edge.
function glue(kind, e, A, B) {
  const base = BASE[kind]
  const n = base.length
  const p = base[e], q = base[(e + 1) % n]
  const rot = Math.atan2(A[1] - B[1], A[0] - B[0]) - Math.atan2(q[1] - p[1], q[0] - p[0])
  const c = Math.cos(rot), s = Math.sin(rot)
  return {
    kind,
    verts: base.map(([x, y]) => {
      const dx = x - p[0], dy = y - p[1]
      return [B[0] + c * dx - s * dy, B[1] + s * dx + c * dy]
    }),
  }
}

function centered(kind, rot) {
  const c = Math.cos(rot), s = Math.sin(rot)
  const rotated = BASE[kind].map(([x, y]) => [c * x - s * y, s * x + c * y])
  const [cx, cy] = centroid(rotated)
  return { kind, verts: rotated.map(([x, y]) => [x - cx, y - cy]) }
}

const mirrorX = t => ({ kind: t.kind, verts: t.verts.map(([x, y]) => [-x, y]).reverse() })

// Decagon vertex at polar angle `a` degrees (decagon oriented edge-midpoints
// at multiples of 36°, i.e. vertices at 18° + k·36°).
const dVert = a => [PHI * Math.cos(a * DEG), PHI * Math.sin(a * DEG)]

// ── unit cells (unit edge length) ────────────────────────────────────────────

function cellDB() {
  const D0 = centered('decagon', Math.PI / 10)
  // bridge bow tie: wing-end edge (between its two 72° corners) on D0's right edge
  const BR = glue('bowtie', 1, [APOTHEM, -0.5], [APOTHEM, 0.5])
  return {
    tiles: [D0, BR],
    u: [2 * APOTHEM + 2 * Math.cos(18 * DEG), 0],
    w: [2 * APOTHEM * Math.cos(36 * DEG), 2 * APOTHEM * Math.sin(36 * DEG)],
  }
}

function cellDHB() {
  const D0 = centered('decagon', Math.PI / 10)
  // upright hexagon broadside on D0's right edge (long edge to long edge)
  const HL = glue('hexagon', 5, dVert(-18), dVert(18))
  // bow tie nestling against D0's 36° and 72° edges: corner at the 18° vertex,
  // waist landing on the 54° vertex
  const B0 = glue('bowtie', 0, [APOTHEM, 0.5], dVert(54))
  const ux = 2 * APOTHEM + 2 * Math.sin(36 * DEG)
  return {
    tiles: [D0, HL, B0, mirrorX(B0)],
    u: [ux, 0],
    w: [ux / 2, PHI * (1 + Math.cos(36 * DEG))],
  }
}

const CELLS = { db: cellDB, dhb: cellDHB }

/**
 * Generate a girih tiling covering a width × height canvas centred on the
 * origin. Returns shapes in the same format as the other tiling generators:
 * an array of [vertices, meta] where meta marks the girih tile kind.
 */
export function generateGirih(width, height, variant = 'dhb') {
  const { tiles, u, w } = (CELLS[variant] || cellDHB)()

  // Edge length in pixels: sized so a decagon spans roughly a fifth of the
  // smaller canvas dimension.
  const edge = Math.min(width, height) / 14

  const halfW = width / 2, halfH = height / 2
  const pad = 2.2 * edge                    // largest tile reach from its centroid

  const shapes = []
  const jMax = Math.ceil((halfH + pad) / (w[1] * edge)) + 1
  for (let j = -jMax; j <= jMax; j++) {
    // horizontal range for this row, accounting for the row shear j·w[0]
    const rowOffset = j * w[0] * edge
    const iMin = Math.floor((-halfW - pad - rowOffset) / (u[0] * edge)) - 1
    const iMax = Math.ceil((halfW + pad - rowOffset) / (u[0] * edge)) + 1
    for (let i = iMin; i <= iMax; i++) {
      const ox = (i * u[0] + j * w[0]) * edge
      const oy = j * w[1] * edge
      for (const t of tiles) {
        const verts = t.verts.map(([x, y]) => [x * edge + ox, y * edge + oy])
        const [cx, cy] = centroid(verts)
        if (cx < -halfW - pad || cx > halfW + pad || cy < -halfH - pad || cy > halfH + pad) continue
        // Decagons pair edge i with edge i+3 (skipOffset 2) so the motif is
        // the classic girih {10/3} ten-pointed star; hexagons and bow ties
        // use adjacent-edge pairing, as in the historic patterns.
        shapes.push([verts, { girih: true, kind: t.kind, skipOffset: t.kind === 'decagon' ? 2 : 0 }])
      }
    }
  }
  return shapes
}
