// Hankin "Polygons in Contact" algorithm.
// Each edge emits two rays at ±θ from its inward normal; the left ray of edge i
// pairs with the right ray of edge (i+1+skip)%n, converging at a star point.
//
// Thick mode: each ray becomes two offset band-edge lines (bplus outer, bminus inner).
// Overlap mode: each edge radiates a + band (left ray) and a − band (right ray);
//   each band is a ribbon bounded by its bplus/bminus lines. Bands weave by
//   alternating over/under at successive ribbon crossings along their travel:
//   a + band goes OVER its first crossing (the − band of its own edge) then
//   alternates under/over/…; a − band goes UNDER its first crossing then
//   alternates. When the two bands at a crossing disagree (both claim over or
//   both claim under), the + band wins over the − band as a tie-break.
//   The band that is under at a crossing gets a gap cut over the span where it
//   passes behind the other band's ribbon (plus an overlapGap margin).

function rotate2D([x, y], a) {
  const c = Math.cos(a), s = Math.sin(a)
  return [x * c - y * s, x * s + y * c]
}
function sub2D([ax, ay], [bx, by]) { return [ax - bx, ay - by] }
function add2D([ax, ay], [bx, by]) { return [ax + bx, ay + by] }
function scale2D([x, y], s) { return [x * s, y * s] }
function norm2D([x, y]) { const l = Math.sqrt(x * x + y * y); return l ? [x / l, y / l] : [0, 0] }
function dot2D([ax, ay], [bx, by]) { return ax * bx + ay * by }
function cross2D([ax, ay], [bx, by]) { return ax * by - ay * bx }

function centroid(vertices) {
  const n = vertices.length
  return [
    vertices.reduce((s, v) => s + v[0], 0) / n,
    vertices.reduce((s, v) => s + v[1], 0) / n,
  ]
}

// Returns [t, s, point] for the intersection of ray (o1+t*d1) and (o2+s*d2), or null.
function rayIntersect(o1, d1, o2, d2) {
  const denom = cross2D(d1, d2)
  if (Math.abs(denom) < 1e-10) return null
  const diff = sub2D(o2, o1)
  const t = cross2D(diff, d2) / denom
  const s = cross2D(diff, d1) / denom
  if (t < 1e-6 || s < 1e-6) return null
  return [t, s, add2D(o1, scale2D(d1, t))]
}

function pointInPolygon([px, py], vertices) {
  const n = vertices.length
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function rayExitPolygon(origin, dir, vertices) {
  const n = vertices.length
  let minT = Infinity
  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n]
    const ex = b[0] - a[0], ey = b[1] - a[1]
    const denom = dir[0] * ey - dir[1] * ex
    if (Math.abs(denom) < 1e-10) continue
    const dx = a[0] - origin[0], dy = a[1] - origin[1]
    const t = (dx * ey - dy * ex) / denom
    const u = (dx * dir[1] - dy * dir[0]) / denom
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6) minT = Math.min(minT, t)
  }
  return minT < Infinity ? [origin[0] + dir[0] * minT, origin[1] + dir[1] * minT] : null
}

// Returns per-edge ray objects for each band variant.
// thick=false → one variant; thick=true → [bplus (outer), bminus (inner)].
function makeEdgeRays(vertices, thetaAt, delta, thick = false, bandWidth = 0.2) {
  const n = vertices.length
  const c = centroid(vertices)

  const buildVariant = (deltaForEdge) => {
    const edges = []
    for (let i = 0; i < n; i++) {
      const a = vertices[i], b = vertices[(i + 1) % n]
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const edgeDir = norm2D(sub2D(b, a))
      const edgeLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
      let normal = rotate2D(edgeDir, Math.PI / 2)
      if (dot2D(normal, sub2D(c, mid)) < 0) normal = [-normal[0], -normal[1]]

      const edgeTheta = thetaAt(mid[0], mid[1])
      const offset = deltaForEdge(edgeTheta) * edgeLen * 0.5
      const oLeft  = sub2D(mid, scale2D(edgeDir, offset))
      const oRight = add2D(mid, scale2D(edgeDir, offset))

      edges.push({
        left:  { origin: oLeft,  dir: rotate2D(normal, +edgeTheta) },
        right: { origin: oRight, dir: rotate2D(normal, -edgeTheta) },
      })
    }
    return edges
  }

  if (!thick) return [buildVariant(() => delta)]
  return [
    buildVariant(et => delta - Math.min(2, bandWidth / Math.cos(et))),
    buildVariant(et => delta + Math.min(2, bandWidth / Math.cos(et))),
  ]
}

function ensureClockwise(vertices) {
  let area = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const [ax, ay] = vertices[i]
    const [bx, by] = vertices[(i + 1) % n]
    area += ax * by - bx * ay
  }
  return area > 0 ? [...vertices].reverse() : vertices
}

// Maps each edge i to the partner edge whose right ray pairs with edge i's
// left ray. Convex tiles pair around a single cycle: i → (i+1+skip) % n.
// Non-convex tiles with exactly two reflex vertices (girih bow ties) are
// split at the reflex vertices into two edge chains, and each chain pairs as
// its own closed cycle — the chain-closing pair meets across the waist — so
// the motif stays inside each lobe instead of straddling the pinch.
// `skip` only activates for cycles with strictly more than 6 edges; smaller
// polygons keep their adjacent-edge motif.
function buildPairMap(vertices, skip) {
  const n = vertices.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const [ax, ay] = vertices[i]
    const [bx, by] = vertices[(i + 1) % n]
    area += ax * by - bx * ay
  }
  const wind = area >= 0 ? 1 : -1

  const reflex = []
  for (let i = 0; i < n; i++) {
    const p = vertices[(i - 1 + n) % n], v = vertices[i], q = vertices[(i + 1) % n]
    const cr = (v[0] - p[0]) * (q[1] - v[1]) - (v[1] - p[1]) * (q[0] - v[0])
    if (cr * wind < -1e-9) reflex.push(i)
  }

  const pairWith = new Array(n)
  if (reflex.length === 2) {
    // edge k runs v[k] → v[k+1]; the chain starting at reflex vertex r owns
    // edges r, r+1, … up to (but not including) the other reflex vertex
    const chains = [[], []]
    for (let k = reflex[0]; k !== reflex[1]; k = (k + 1) % n) chains[0].push(k)
    for (let k = reflex[1]; k !== reflex[0]; k = (k + 1) % n) chains[1].push(k)
    for (const chain of chains) {
      const cs = chain.length > 6 ? skip : 0
      chain.forEach((e, idx) => { pairWith[e] = chain[(idx + 1 + cs) % chain.length] })
    }
  } else {
    const s = n > 6 ? skip : 0
    for (let i = 0; i < n; i++) pairWith[i] = (i + 1 + s) % n
  }
  return pairWith
}

// Returns t-values on segment a→b where it is crossed by segment c→d.
// Normal case: one t (crossing within c→d's extent).
// Collinear case: two t values bracketing the overlap.
// t is NOT clamped — caller clamps to [0,1].
function bandCrossParam(a, b, c, d) {
  const dab = [b[0] - a[0], b[1] - a[1]]
  const dcd = [d[0] - c[0], d[1] - c[1]]
  const denom = cross2D(dab, dcd)
  if (Math.abs(denom) < 1e-10) {
    const lenAB2 = dab[0] ** 2 + dab[1] ** 2
    if (lenAB2 < 1e-10) return []
    const perp = Math.abs(cross2D(sub2D(c, a), dab)) / Math.sqrt(lenAB2)
    if (perp > 1e-4) return []
    const tc = dot2D(sub2D(c, a), dab) / lenAB2
    const td = dot2D(sub2D(d, a), dab) / lenAB2
    const t0 = Math.min(tc, td), t1 = Math.max(tc, td)
    if (t1 - t0 < 1e-6) return []
    return [t0, t1]
  }
  const diff = sub2D(c, a)
  const t = cross2D(diff, dcd) / denom
  const s = cross2D(diff, dab) / denom
  if (s < -1e-4 || s > 1 + 1e-4) return []
  return [t]
}

// Merges overlapping [a, b] intervals. Input need not be sorted.
function mergeIntervals(intervals) {
  if (intervals.length === 0) return []
  intervals.sort((a, b) => a[0] - b[0])
  const out = [[intervals[0][0], intervals[0][1]]]
  for (let k = 1; k < intervals.length; k++) {
    const last = out[out.length - 1]
    if (intervals[k][0] <= last[1] + 1e-9) last[1] = Math.max(last[1], intervals[k][1])
    else out.push([intervals[k][0], intervals[k][1]])
  }
  return out
}

// Returns the [lo, hi] sub-interval (param in [0,1]) of segment from→to that
// lies inside `band`'s ribbon — the strip between its two boundary segments —
// or null if the segment never enters it. Unlike a pure boundary-crossing
// test this handles an endpoint that starts or ends inside the ribbon (the
// case where a crossbar point lands within another band), extending the
// interval to that endpoint instead of missing it.
function segmentInRibbon(from, to, band) {
  const segs = band.segs
  if (segs.length < 2) return null
  // The ribbon quad: edge origins out to the two tip points and back. Clip the
  // segment against all four sides (the long boundary lines *and* the end caps)
  // so a segment leaving through the tip cap is detected, not just the sides.
  const quad = [segs[0].origin, segs[0].end, segs[1].end, segs[1].origin]
  const fromIn = pointInPolygon(from, quad)
  const toIn   = pointInPolygon(to, quad)
  const ts = []
  for (let e = 0; e < 4; e++) {
    const a = quad[e], b = quad[(e + 1) % 4]
    for (const t of bandCrossParam(from, to, a, b))
      if (t > -1e-4 && t < 1 + 1e-4) ts.push(Math.max(0, Math.min(1, t)))
  }
  if (!fromIn && !toIn && ts.length === 0) return null
  const lo = fromIn ? 0 : (ts.length ? Math.min(...ts) : 0)
  const hi = toIn   ? 1 : (ts.length ? Math.max(...ts) : 1)
  return [lo, hi]
}

// Pushes all visible sub-segments of origin→end after removing the (pre-merged) gap intervals.
function pushWithGaps(list, origin, end, gapIntervals) {
  const dx = end[0] - origin[0], dy = end[1] - origin[1]
  if (dx * dx + dy * dy < 1e-12) return
  const lerp = t => [origin[0] + t * dx, origin[1] + t * dy]
  let prev = 0
  for (const [a, b] of gapIntervals) {
    const ac = Math.max(0, a), bc = Math.min(1, b)
    if (ac > prev + 1e-6) list.push([lerp(prev), lerp(ac)])
    if (bc > prev) prev = bc
  }
  if (prev < 1 - 1e-6) list.push([lerp(prev), lerp(1)])
}

function buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed,
                      linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1) {
  if (parquetDirection === 'none') return () => theta

  const lerp = w => thetaMin + Math.max(0, Math.min(1, w)) * (thetaMax - thetaMin)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxR = 0
  for (const shape of shapes) {
    const raw = shape[0]
    if (!raw) continue
    for (const [x, y] of raw) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const r = Math.sqrt(x * x + y * y)
      if (r > maxR) maxR = r
    }
  }
  const rangeX = maxX - minX || 1e-8
  const rangeY = maxY - minY || 1e-8
  maxR = maxR || 1e-8

  if (parquetDirection === 'ltr') {
    const ca = Math.cos(linearAngle), sa = Math.sin(linearAngle)
    let minP = Infinity, maxP = -Infinity
    for (const shape of shapes) {
      const raw = shape[0]; if (!raw) continue
      for (const [vx, vy] of raw) {
        const p = vx * ca + vy * sa
        if (p < minP) minP = p
        if (p > maxP) maxP = p
      }
    }
    const rangeP = maxP - minP || 1e-8
    return (x, y) => lerp((x * ca + y * sa - minP) / rangeP)
  }
  if (parquetDirection === 'btt') {
    return (_x, y) => lerp((maxY - y) / rangeY)
  }
  if (parquetDirection === 'centered') {
    const cosA = Math.cos(ellipseAngle), sinA = Math.sin(ellipseAngle)
    const maj = (ellipseMajorScale || 1) * maxR
    const min = (ellipseMinorScale || 1) * maxR
    return (x, y) => {
      const dx = x - centerX, dy = y - centerY
      const lx = (dx * cosA + dy * sinA) / maj
      const ly = (-dx * sinA + dy * cosA) / min
      return lerp(Math.sqrt(lx * lx + ly * ly))
    }
  }
  if (parquetDirection === 'fn') {
    const t = time * speed
    if (parquetFunction === 'wave-ltr') {
      return (x, _y) => lerp((Math.sin(((x - minX) / rangeX) * Math.PI * 5 - t * 1.5) + 1) / 2)
    }
    if (parquetFunction === 'wave-btt') {
      return (_x, y) => lerp((Math.sin(((maxY - y) / rangeY) * Math.PI * 5 - t * 1.5) + 1) / 2)
    }
    if (parquetFunction === 'ripple') {
      return (x, y) => lerp((Math.sin((Math.sqrt(x * x + y * y) / maxR) * Math.PI * 6 - t * 2) + 1) / 2)
    }
    if (parquetFunction === 'pulse') {
      const w = (Math.sin(t * 2) + 1) / 2
      return () => lerp(w)
    }
  }
  return () => theta
}

// Computes the motif segments for one tile. `vertices` must be in clockwise
// winding. Plain segments are pushed into outOver; segments that had weave
// gaps cut into them are pushed into outUnder (drawn first).
//
// `crossbar` (0..1) bevels the star point. Instead of the two rays of a strand
// meeting at a sharp point X, each ray is cut short at a fraction `crossbar` of
// the way from X back toward its origin and the two cut points are joined by a
// short "crossbar" segment — so crossbar=0 is the classic sharp join, 0.5 puts
// the bar at the midpoints of both rays, and larger values pull the bar out
// toward the tile edges.
function computeTileSegments(vertices, thetaAt, delta, thick, overlap, overlapGap, bandWidth, skip, crossbar, outUnder, outOver) {
  const n = vertices.length

  const pairWith = buildPairMap(vertices, skip)

  const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)

  // Star point for each pair i (shared by all band variants of that pair)
  const starPts = allEdgeRays.map(edges =>
    Array.from({ length: n }, (_, i) => {
      const j = pairWith[i]
      const rayA = edges[i].left, rayB = edges[j].right
      const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
      const ptInside = pt && pointInPolygon(pt, vertices)
      return ptInside
        ? pt
        : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
    })
  )

  // One strand per pair i. Each strand owns 2 segs (non-thick) or 4 segs (thick):
  // the A-side (left ray of edge i) and B-side (right ray of edge jPair) for each band.
  // With crossbar > 0 each ray ends short of the star point at `pCut`, and the two
  // cut points of each band variant are bridged by a crossbar segment.
  const useCrossbar = crossbar > 1e-6
  const strands = Array.from({ length: n }, (_, i) => {
    const jPair = pairWith[i]
    const segs = []
    const crossbars = []
    for (let di = 0; di < allEdgeRays.length; di++) {
      const X  = starPts[di][i]
      const oA = allEdgeRays[di][i].left.origin
      const oB = allEdgeRays[di][jPair].right.origin
      if (useCrossbar) {
        // pCut = X + crossbar·(origin − X): cut point a fraction of the way back from X.
        const pA = [X[0] + crossbar * (oA[0] - X[0]), X[1] + crossbar * (oA[1] - X[1])]
        const pB = [X[0] + crossbar * (oB[0] - X[0]), X[1] + crossbar * (oB[1] - X[1])]
        segs.push({ origin: oA, end: pA, isA: true  })
        segs.push({ origin: oB, end: pB, isA: false })
        crossbars.push([pA, pB])
      } else {
        segs.push({ origin: oA, end: X, isA: true  })
        segs.push({ origin: oB, end: X, isA: false })
      }
    }
    return { segs, jPair, crossbars }
  })

  const edgeLens = Array.from({ length: n }, (_, i) => {
    const va = vertices[i], vb = vertices[(i + 1) % n]
    return Math.sqrt((vb[0] - va[0]) ** 2 + (vb[1] - va[1]) ** 2)
  })

  // No weave: push all segments flat
  if (!overlap || !thick) {
    for (const strand of strands) {
      for (const seg of strand.segs) outOver.push([seg.origin, seg.end])
      for (const cbar of strand.crossbars) outOver.push(cbar)
    }
    return
  }

  // ── Weave rendering ────────────────────────────────────────────────────────

  // Step 1: split each strand into its two bands. The + band is the left ray
  // of edge i; the − band is the right ray of edge jPair. Each band owns the
  // segments of both bplus/bminus boundary lines of that ray.
  const bands = []
  for (let i = 0; i < n; i++) {
    const { segs, jPair } = strands[i]
    bands.push({ segs: segs.filter(s => s.isA),  plus: true,  strand: i, edgeLen: edgeLens[i] })
    bands.push({ segs: segs.filter(s => !s.isA), plus: false, strand: i, edgeLen: edgeLens[jPair] })
  }

  // Step 2: find every ribbon crossing between bands of different strands.
  // (The two bands of one strand join at the star point — that is a bend in
  // the ribbon, not a crossing.) For each crossing record, per boundary
  // segment of each band, the clamped t-values where it crosses the other
  // band's boundary lines, plus a representative t for ordering along travel.
  const crossTs = (segsA, segsB) => segsA.map(sa =>
    segsB.flatMap(sb => bandCrossParam(sa.origin, sa.end, sb.origin, sb.end))
         .filter(t => t > -1e-4 && t < 1 - 1e-6)
         .map(t => Math.max(0, Math.min(1, t))))

  const crossings = []
  for (let x = 0; x < bands.length; x++) {
    for (let y = x + 1; y < bands.length; y++) {
      if (bands[x].strand === bands[y].strand) continue
      const tsOnA = crossTs(bands[x].segs, bands[y].segs)
      const tsOnB = crossTs(bands[y].segs, bands[x].segs)
      const flatA = tsOnA.flat(), flatB = tsOnB.flat()
      if (flatA.length === 0 || flatB.length === 0) continue
      crossings.push({
        a: x, b: y, tsOnA, tsOnB,
        repA: flatA.reduce((s, t) => s + t, 0) / flatA.length,
        repB: flatB.reduce((s, t) => s + t, 0) / flatB.length,
      })
    }
  }

  // Step 3: alternate over/under along each band. Sorted by distance from the
  // band's origin, crossing k is "over" for a + band when k is even, and for
  // a − band when k is odd — so at the shared-edge crossing (first for both)
  // the + band sits on top of the − band, and the weave alternates from there.
  for (let bi = 0; bi < bands.length; bi++) {
    const mine = []
    for (const c of crossings) {
      if (c.a === bi)      mine.push({ c, rep: c.repA, side: 'a' })
      else if (c.b === bi) mine.push({ c, rep: c.repB, side: 'b' })
    }
    mine.sort((p, q) => p.rep - q.rep)
    mine.forEach((m, k) => {
      const over = bands[bi].plus ? k % 2 === 0 : k % 2 === 1
      if (m.side === 'a') m.c.aOver = over
      else                m.c.bOver = over
    })
  }

  // Step 4: cut a gap in whichever band is under at each crossing.
  // When both bands claim the same state (non-alternating geometry), the
  // + band wins over the − band; between same-sign bands the first wins.
  const gaps = bands.map(b => b.segs.map(() => []))
  for (const c of crossings) {
    let aOver
    if (c.aOver !== c.bOver) aOver = c.aOver
    else if (bands[c.a].plus !== bands[c.b].plus) aOver = bands[c.a].plus
    else aOver = true
    c.aOverResolved = aOver  // band c.a is over here iff true (used for crossbar depth)
    const underIdx = aOver ? c.b : c.a
    const tsUnder  = aOver ? c.tsOnB : c.tsOnA
    const under = bands[underIdx]
    tsUnder.forEach((ts, si2) => {
      if (ts.length === 0) return
      const seg = under.segs[si2]
      const sl = Math.sqrt((seg.end[0] - seg.origin[0]) ** 2 + (seg.end[1] - seg.origin[1]) ** 2)
      const extraG = sl > 1e-8 ? (overlapGap * under.edgeLen) / sl : 0
      // One contiguous gap: entry to exit through the over band's ribbon
      gaps[underIdx][si2].push([Math.min(...ts) - extraG, Math.max(...ts) + extraG])
    })
  }

  // Step 5: push segments. Gapped segments go to outUnder (drawn first),
  // untouched ones to outOver.
  for (let bi = 0; bi < bands.length; bi++) {
    bands[bi].segs.forEach((seg, si2) => {
      const intervals = gaps[bi][si2]
      if (intervals.length === 0) outOver.push([seg.origin, seg.end])
      else pushWithGaps(outUnder, seg.origin, seg.end, mergeIntervals(intervals))
    })
  }

  // Depth of each band at its far end (the point nearest the star, where the
  // crossbar attaches): the resolved over/under state at the band's last
  // crossing. A band with no crossings defaults to over.
  const endOver = bands.map(() => true)
  for (let bi = 0; bi < bands.length; bi++) {
    let bestRep = -Infinity
    for (const c of crossings) {
      if (c.a === bi && c.repA > bestRep)      { bestRep = c.repA; endOver[bi] = c.aOverResolved }
      else if (c.b === bi && c.repB > bestRep) { bestRep = c.repB; endOver[bi] = !c.aOverResolved }
    }
  }

  // Crossbars bridge a strand's two band ends at the star point. Each crossbar
  // is split at its midpoint so each half takes the depth of the ray end it
  // attaches to (+ band end for the pA half, − band end for the pB half): an
  // "over" half is drawn on top; an "under" half is gapped over every span where
  // it lies within another strand's ribbon — including where its own endpoint
  // falls inside that ribbon — so it weaves under just like the ray does.
  for (let i = 0; i < n; i++) {
    const plusEndOver = endOver[2 * i], minusEndOver = endOver[2 * i + 1]
    for (const [pA, pB] of strands[i].crossbars) {
      const mid = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2]
      for (const [from, to, isOver] of [[pA, mid, plusEndOver], [mid, pB, minusEndOver]]) {
        if (isOver) { outOver.push([from, to]); continue }
        const sl = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2)
        const extraG = sl > 1e-8 ? (overlapGap * edgeLens[i]) / sl : 0
        const intervals = []
        for (let bj = 0; bj < bands.length; bj++) {
          if (bands[bj].strand === i) continue
          const occ = segmentInRibbon(from, to, bands[bj])
          if (occ) intervals.push([occ[0] - extraG, occ[1] + extraG])
        }
        if (intervals.length === 0) outOver.push([from, to])
        else pushWithGaps(outUnder, from, to, mergeIntervals(intervals))
      }
    }
  }
}

// ── Motif caching ────────────────────────────────────────────────────────────
// When θ is spatially constant (no parquet deformation), every offset in the
// motif scales with edge length and the weave is decided by intra-tile geometry
// alone, so a tile's motif is equivariant under rotation + translation.
// Congruent tiles therefore share one computation: each tile is mapped to a
// canonical frame (vertex 0 at the origin, edge 0→1 along +x), the motif is
// computed once per distinct canonical shape, and the cached segments are
// stamped back through each tile's own rigid transform.

const MOTIF_CACHE_MAX = 4096
const motifCache = { params: null, map: new Map() }

// Rigid transform of a clockwise polygon into the canonical frame. The cache
// key quantises canonical vertices to 0.01 px: congruent tiles collide, and a
// near-miss at a rounding boundary causes a redundant recompute, never a
// wrong reuse. Reflected tiles get distinct keys, which is required — the
// motif is not mirror-symmetric in general.
function canonicalize(vertices) {
  const [ox, oy] = vertices[0]
  const angle = Math.atan2(vertices[1][1] - oy, vertices[1][0] - ox)
  const c = Math.cos(angle), s = Math.sin(angle)
  const canon = vertices.map(([x, y]) => {
    const dx = x - ox, dy = y - oy
    return [dx * c + dy * s, dy * c - dx * s]
  })
  const key = canon.map(([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`).join(';')
  return { canon, key, ox, oy, c, s }
}

// Maps cached segments out of the canonical frame: rotate back, then translate.
function stampSegments(out, segs, c, s, ox, oy) {
  for (const [[x1, y1], [x2, y2]] of segs) {
    out.push([
      [x1 * c - y1 * s + ox, x1 * s + y1 * c + oy],
      [x2 * c - y2 * s + ox, x2 * s + y2 * c + oy],
    ])
  }
}

export function getHankinSegments(shapes, theta = Math.PI / 4, delta = 0, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, skip = 0, crossbar = 0) {
  const allUnder = [], allOver = []

  const thetaAt = buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)

  // With spatially varying θ a tile's motif depends on its position, so
  // congruent tiles cannot share results and the cache is bypassed.
  const cacheable = parquetDirection === 'none'
  if (cacheable) {
    const params = `${theta}|${delta}|${thick}|${overlap}|${overlapGap}|${bandWidth}|${skip}|${crossbar}`
    if (motifCache.params !== params) {
      motifCache.params = params
      motifCache.map.clear()
    }
  }

  for (const shape of shapes) {
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)

    if (!cacheable) {
      computeTileSegments(vertices, thetaAt, delta, thick, overlap, overlapGap, bandWidth, skip, crossbar, allUnder, allOver)
      continue
    }

    const { canon, key, ox, oy, c, s } = canonicalize(vertices)
    let entry = motifCache.map.get(key)
    if (!entry) {
      entry = { under: [], over: [] }
      computeTileSegments(canon, thetaAt, delta, thick, overlap, overlapGap, bandWidth, skip, crossbar, entry.under, entry.over)
      if (motifCache.map.size < MOTIF_CACHE_MAX) motifCache.map.set(key, entry)
    }
    stampSegments(allUnder, entry.under, c, s, ox, oy)
    stampSegments(allOver, entry.over, c, s, ox, oy)
  }

  return { underSegs: allUnder, overSegs: allOver }
}

// Semi-transparent palette for region fills; assigned in encounter order so same-shape
// regions always get the same colour within a single draw call.
const REGION_COLORS = [
  'rgba(255, 80, 80,0.35)',
  'rgba( 70,145,255,0.35)',
  'rgba( 70,215,110,0.35)',
  'rgba(200, 70,255,0.35)',
  'rgba(255,200, 45,0.35)',
  'rgba( 70,225,225,0.35)',
  'rgba(255,135, 45,0.35)',
  'rgba(175,240, 70,0.35)',
  'rgba(255, 70,175,0.35)',
  'rgba(115,195,255,0.35)',
  'rgba(255,175, 95,0.35)',
  'rgba(155,255,155,0.35)',
]

// Region boundaries follow the Hankin rays: vertices alternate between star points
// (ray intersections) and tile-edge midpoints (where the rays originate from).
// Sorting all 2n points by angle around the region centre naturally interleaves them.
//
// Tile-centre region: n star points + n tile-edge midpoints → 2n-gon.
// Vertex region:      k star points (one per adjacent tile) + k edge midpoints
//                     (one per edge radiating from the vertex) → 2k-gon.
function drawHankinRegions(ctx, shapes, thetaAt, delta, bandWidth, skip) {
  const colorMap = new Map()
  let nextIdx = 0
  const colorFor = key => {
    if (!colorMap.has(key)) colorMap.set(key, REGION_COLORS[nextIdx++ % REGION_COLORS.length])
    return colorMap.get(key)
  }

  const SNAP = 0.5  // tolerance for deduplicating shared points
  // vertex key → { pos, stars:[{pt,tileN}], edgeMids:[[x,y]…] }
  const vertexMap = new Map()

  function fillPoly(pts) {
    if (pts.length < 3) return
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
    ctx.fill()
  }

  ctx.save()

  for (const shape of shapes) {
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)
    const n = vertices.length
    const pairWith = buildPairMap(vertices, skip)
    const [edges] = makeEdgeRays(vertices, thetaAt, delta, false, bandWidth)
    const c = centroid(vertices)

    const starPts = Array.from({ length: n }, (_, i) => {
      const j = pairWith[i]
      const rayA = edges[i].left, rayB = edges[j].right
      const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
      return (pt && pointInPolygon(pt, vertices))
        ? pt
        : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
    })

    // Midpoint of each tile edge (shared with the neighbour tile)
    const tileMids = Array.from({ length: n }, (_, i) => {
      const a = vertices[i], b = vertices[(i + 1) % n]
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    })

    // Tile-centre region: interleave star points with edge midpoints sorted by angle
    const tilePoly = [...starPts, ...tileMids]
      .sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]))
    ctx.fillStyle = colorFor(`t${n}`)
    fillPoly(tilePoly)

    // Accumulate vertex-region data. Round to 0.5-unit grid for stable key matching.
    for (let k = 0; k < n; k++) {
      const v = vertices[k]
      const vkey = `${Math.round(v[0] * 2)},${Math.round(v[1] * 2)}`

      let best = starPts[0], bestD = Infinity
      for (const sp of starPts) {
        const d = (sp[0] - v[0]) ** 2 + (sp[1] - v[1]) ** 2
        if (d < bestD) { bestD = d; best = sp }
      }

      if (!vertexMap.has(vkey)) vertexMap.set(vkey, { pos: v, stars: [], edgeMids: [] })
      const vm = vertexMap.get(vkey)
      vm.stars.push({ pt: best, tileN: n })

      // Two edge midpoints radiating outward from V; shared with neighbours so dedup by position.
      for (const mid of [tileMids[k], tileMids[(k - 1 + n) % n]]) {
        if (!vm.edgeMids.some(m => Math.abs(m[0] - mid[0]) < SNAP && Math.abs(m[1] - mid[1]) < SNAP))
          vm.edgeMids.push(mid)
      }
    }
  }

  // Vertex regions
  for (const { pos: v, stars, edgeMids } of vertexMap.values()) {
    if (stars.length < 3) continue
    const uniq = stars.filter((e, idx) =>
      stars.findIndex(f =>
        Math.abs(f.pt[0] - e.pt[0]) < SNAP &&
        Math.abs(f.pt[1] - e.pt[1]) < SNAP) === idx)
    if (uniq.length < 3) continue

    // Merge star points and edge midpoints; sort angularly round the vertex
    const allPts = [...uniq.map(e => e.pt), ...edgeMids]
      .sort((a, b) =>
        Math.atan2(a[1] - v[1], a[0] - v[0]) - Math.atan2(b[1] - v[1], b[0] - v[0]))

    const nsKey = uniq.map(e => e.tileN).sort((a, b) => a - b).join('.')
    ctx.fillStyle = colorFor(`v${uniq.length}.${nsKey}`)
    fillPoly(allPts)
  }

  ctx.restore()
}

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, skip = 0, crossbar = 0) {
  // Compute thetaAt once when in debug mode; reused by both region fills and ray visualisation.
  const thetaAt = debug
    ? buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)
    : null

  // Region fills drawn first so they sit behind the motif lines
  if (debug) drawHankinRegions(ctx, shapes, thetaAt, delta, bandWidth, skip)

  const { underSegs, overSegs } = getHankinSegments(shapes, theta, delta, thick, overlap, overlapGap, bandWidth, parquetDirection, thetaMin, thetaMax, parquetFunction, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale, skip, crossbar)

  for (const [p1, p2] of underSegs) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }
  for (const [p1, p2] of overSegs) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }

  if (debug) {
    const r = 3 / (ctx.getTransform?.().a ?? 1)
    ctx.save()
    ctx.lineWidth = 1 / (ctx.getTransform?.().a ?? 1)

    for (const shape of shapes) {
      const raw = shape[0]
      if (!raw || raw.length < 3) continue
      const vertices = ensureClockwise(raw)
      const n = vertices.length

      const pairWith = buildPairMap(vertices, skip)
      const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)
      for (let di = 0; di < allEdgeRays.length; di++) {
        const edges = allEdgeRays[di]
        for (let i = 0; i < n; i++) {
          const j = pairWith[i]
          const rayA = edges[i].left, rayB = edges[j].right
          const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
          const ptInside = pt && pointInPolygon(pt, vertices)
          const end = ptInside ? pt : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
          if (!end) continue

          const hue = (i / n) * 360
          const color = `hsl(${hue}, 90%, ${di === 0 ? 55 : 75}%)`
          ctx.strokeStyle = color; ctx.fillStyle = color

          ctx.beginPath(); ctx.moveTo(rayA.origin[0], rayA.origin[1]); ctx.lineTo(end[0], end[1]); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(rayB.origin[0], rayB.origin[1]); ctx.lineTo(end[0], end[1]); ctx.stroke()
          ctx.beginPath(); ctx.arc(end[0], end[1], r, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    ctx.restore()
  }
}
