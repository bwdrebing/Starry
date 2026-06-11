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
  pentagon: mkTile(Array(5).fill(108)),
  rhombus: mkTile([72, 108, 72, 108]),
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

// ── radial (aperiodic) girih patches ─────────────────────────────────────────
// Grows a D10-symmetric patch outward from a central decagon: the open vertex
// nearest the origin is filled with the first tile corner (from a per-variant
// preference list) whose whole symmetry orbit fits, so the pattern radiates
// outward with perfect 10-fold mirror symmetry. Global 10-fold symmetry makes
// the resulting tiling necessarily non-periodic. A small backtracking budget
// guards against dead ends, and the deterministic preference order means a
// given variant always produces the same patch.

// Per-variant tile-corner preference lists (corner = vertex index in BASE).
// The two variants differ in what they reach for first, which changes the
// rings that crystallise around the centre.
const RADIAL_PREFS = {
  rosette: [
    ['pentagon', 0], ['decagon', 0], ['hexagon', 0], ['hexagon', 2], ['bowtie', 0],
    ['rhombus', 1], ['rhombus', 0], ['bowtie', 1], ['bowtie', 2], ['hexagon', 1],
  ],
  wreath: [
    ['pentagon', 0], ['hexagon', 0], ['hexagon', 2], ['decagon', 0], ['bowtie', 0],
    ['rhombus', 1], ['rhombus', 0], ['bowtie', 1], ['bowtie', 2], ['hexagon', 1],
  ],
}

const interiorAngle = (kind, i) => {
  const v = BASE[kind]
  const n = v.length
  const p = v[(i - 1 + n) % n], c = v[i], q = v[(i + 1) % n]
  let a = Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0])
  a = ((a / DEG) % 360 + 360) % 360
  return a
}

// Place tile so corner ci sits at v with the corner's leading edge (ci → ci+1)
// along direction alphaDeg; the beta variant anchors the trailing edge
// (ci → ci−1) along betaDeg instead.
function placeCorner(kind, ci, v, alphaDeg, beta = false) {
  const base = BASE[kind]
  const n = base.length
  const p = base[ci], q = beta ? base[(ci - 1 + n) % n] : base[(ci + 1) % n]
  const rot = alphaDeg * DEG - Math.atan2(q[1] - p[1], q[0] - p[0])
  const c = Math.cos(rot), s = Math.sin(rot)
  return {
    kind,
    verts: base.map(([x, y]) => {
      const dx = x - p[0], dy = y - p[1]
      return [v[0] + c * dx - s * dy, v[1] + s * dx + c * dy]
    }),
  }
}

// Quantised keys; Object.is guards against "-0" producing a distinct key.
const q3 = v => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}
const ptKey = p => `${q3(p[0])},${q3(p[1])}`
const tileSortKey = t => t.verts.map(ptKey).sort().join('|')

// D10 symmetry orbit of a tile (deduplicated; tiles on a mirror axis map to
// themselves).
function symOrbit(tile) {
  const seen = new Map()
  for (let ref = 0; ref < 2; ref++) {
    for (let k = 0; k < 10; k++) {
      const c = Math.cos(k * 36 * DEG), s = Math.sin(k * 36 * DEG)
      let verts = ref ? tile.verts.map(([x, y]) => [x, -y]).reverse() : tile.verts
      verts = verts.map(([x, y]) => [c * x - s * y, s * x + c * y])
      const img = { kind: tile.kind, verts }
      const key = tileSortKey(img)
      if (!seen.has(key)) seen.set(key, img)
    }
  }
  return [...seen.values()]
}

function pointInPoly(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Interior sample points used for overlap rejection: centroid, edge midpoints
// nudged inward, and vertices pulled toward the centroid.
function tileSamples(t) {
  const n = t.verts.length
  const [cx, cy] = centroid(t.verts)
  const pts = [[cx, cy]]
  for (let i = 0; i < n; i++) {
    const a = t.verts[i], b = t.verts[(i + 1) % n]
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    pts.push([mx - dy / len * 0.04, my + dx / len * 0.04])
    pts.push([a[0] + (cx - a[0]) * 0.15, a[1] + (cy - a[1]) * 0.15])
  }
  return pts
}

function tilesOverlap(a, b) {
  // tiles reach at most ~1.62 from their centroid, so distant pairs are clear
  if ((a._cx - b._cx) ** 2 + (a._cy - b._cy) ** 2 > 11) return false
  for (const p of a._samples) if (pointInPoly(p[0], p[1], b.verts)) return true
  for (const p of b._samples) if (pointInPoly(p[0], p[1], a.verts)) return true
  return false
}

function prepTile(t) {
  const [cx, cy] = centroid(t.verts)
  t._cx = cx
  t._cy = cy
  t._r = Math.hypot(cx, cy)
  t._samples = tileSamples(t)
  return t
}

const norm360 = a => ((a % 360) + 360) % 360

// Free angular arcs at a vertex given the occupied [start, length] arcs.
function freeArcs(arcs) {
  const occ = [...arcs].sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [s, l] of occ) {
    const last = merged[merged.length - 1]
    if (last && s <= last[0] + last[1] + 0.001) last[1] = Math.max(last[1], s + l - last[0])
    else merged.push([s, l])
  }
  if (merged.length > 1) {
    const first = merged[0], last = merged[merged.length - 1]
    if (last[0] + last[1] >= first[0] + 360 - 0.001) {
      const newLen = Math.max(last[1], first[0] + 360 + first[1] - last[0])
      merged.pop()
      merged[0] = [last[0], newLen]
    }
  }
  if (merged.reduce((s, [, l]) => s + l, 0) >= 359.999) return []
  const free = []
  for (let i = 0; i < merged.length; i++) {
    const [s, l] = merged[i]
    const next = merged[(i + 1) % merged.length]
    const gap = norm360(next[0] - (s + l)) || (merged.length === 1 ? 360 - l : 0)
    if (gap > 0.001) free.push([norm360(s + l), gap])
  }
  return free
}

function buildVertexMap(tiles) {
  const m = new Map()
  for (const t of tiles) {
    const n = t.verts.length
    for (let i = 0; i < n; i++) {
      const v = t.verts[i]
      const nx = t.verts[(i + 1) % n], pv = t.verts[(i - 1 + n) % n]
      const a1 = norm360(Math.atan2(nx[1] - v[1], nx[0] - v[0]) / DEG)
      const a2 = norm360(Math.atan2(pv[1] - v[1], pv[0] - v[0]) / DEG)
      const k = ptKey(v)
      if (!m.has(k)) m.set(k, { v: [v[0], v[1]], arcs: [] })
      m.get(k).arcs.push([a1, norm360(a2 - a1) || 360])
    }
  }
  return m
}

// Grow the patch out to radius R (unit-edge coordinates). Patches are
// monotonic in R — vertices are always filled nearest-first, so a larger
// patch is an extension of a smaller one — which makes them safe to memoise
// per variant and reuse for any smaller radius.
const radialCache = new Map()

function fillRadial(variant, R) {
  const cached = radialCache.get(variant)
  if (cached && cached.R >= R) return cached.tiles

  const prefs = RADIAL_PREFS[variant] || RADIAL_PREFS.rosette
  const seed = prepTile({
    kind: 'decagon',
    verts: Array.from({ length: 10 }, (_, k) => {
      const a = (18 + 36 * k) * DEG
      return [PHI * Math.cos(a), PHI * Math.sin(a)]
    }),
  })
  const tiles = [seed]
  let nodes = 0

  function nextTarget() {
    const vm = buildVertexMap(tiles)
    let best = null
    for (const { v, arcs } of vm.values()) {
      const r = Math.hypot(v[0], v[1])
      if (r > R) continue
      const free = freeArcs(arcs)
      if (!free.length) continue
      if (!best || r < best.r - 1e-9) best = { v, free, r }
    }
    return best
  }

  function step() {
    if (++nodes > 4000) return 'budget'
    const target = nextTarget()
    if (!target) return 'done'
    const [alpha, gapLen] = target.free[0]
    const beta = norm360(alpha + gapLen)
    const cands = []
    for (const [kind, corner] of prefs) {
      const ang = interiorAngle(kind, corner)
      if (Math.abs(ang - gapLen) < 0.001) cands.push(placeCorner(kind, corner, target.v, alpha))
      else if (ang < gapLen - 0.001) {
        cands.push(placeCorner(kind, corner, target.v, alpha))
        cands.push(placeCorner(kind, corner, target.v, beta, true))
      }
    }
    outer:
    for (const cand of cands) {
      const orb = symOrbit(cand).map(prepTile)
      for (let i = 0; i < orb.length; i++) {
        for (const t of tiles) {
          if (Math.abs(t._r - orb[i]._r) > 3.4) continue
          if (tilesOverlap(orb[i], t)) continue outer
        }
        for (let j = i + 1; j < orb.length; j++) if (tilesOverlap(orb[i], orb[j])) continue outer
      }
      tiles.push(...orb)
      const res = step()
      if (res === 'done' || res === 'budget') return res
      tiles.length -= orb.length
    }
    return false
  }

  step()
  radialCache.set(variant, { R, tiles })
  return tiles
}

/**
 * Generate a girih tiling covering a width × height canvas centred on the
 * origin. Returns shapes in the same format as the other tiling generators:
 * an array of [vertices, meta] where meta marks the girih tile kind.
 */
export function generateGirih(width, height, variant = 'dhb') {
  // Edge length in pixels: sized so a decagon spans roughly a fifth of the
  // smaller canvas dimension.
  const edge = Math.min(width, height) / 14
  const halfW = width / 2, halfH = height / 2
  const pad = 2.2 * edge                    // largest tile reach from its centroid

  if (RADIAL_PREFS[variant]) {
    // Radial aperiodic patch: grow far enough to cover the canvas corners.
    const R = Math.min(24, Math.hypot(halfW, halfH) / edge + 2.5)
    const shapes = []
    for (const t of fillRadial(variant, R)) {
      const verts = t.verts.map(([x, y]) => [x * edge, y * edge])
      const [cx, cy] = centroid(verts)
      if (cx < -halfW - pad || cx > halfW + pad || cy < -halfH - pad || cy > halfH + pad) continue
      shapes.push([verts, { girih: true, kind: t.kind }])
    }
    return shapes
  }

  const { tiles, u, w } = (CELLS[variant] || cellDHB)()

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
        shapes.push([verts, { girih: true, kind: t.kind }])
      }
    }
  }
  return shapes
}
