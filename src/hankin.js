// Hankin "Polygons in Contact" algorithm.
// Each edge emits two rays at ±θ from its inward normal; the left ray of edge i
// pairs with the right ray of edge (i+1+skip)%n, converging at a star point.
//
// Thick mode: each ray becomes two offset band-edge lines (bplus outer, bminus inner).
// Overlap mode: ribbons weave over/under using BFS 2-colouring of the crossing graph.
//   Each pair of strands is adjacent in the graph if any of their segments cross.
//   A bipartite colouring assigns colour-0 (over) and colour-1 (under) consistently.
//   Odd-cycle components fall back to the A-over-B rule (left ray always over).
//   Under-segments get individual gaps at each crossing with each over-strand,
//   so multiple crossings produce multiple separate gaps rather than one big span.

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

export function getHankinSegments(shapes, theta = Math.PI / 4, delta = 0, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, skip = 0) {
  const allUnder = [], allOver = []

  const thetaAt = buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)

  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si]
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)
    const n = vertices.length

    // skip only activates for polygons with enough sides to avoid degenerate results
    const effectiveSkip = n >= 6 ? skip : 0

    const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)

    // Star point for each pair i (shared by all band variants of that pair)
    const starPts = allEdgeRays.map(edges =>
      Array.from({ length: n }, (_, i) => {
        const j = (i + 1 + effectiveSkip) % n
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
    const strands = Array.from({ length: n }, (_, i) => {
      const jPair = (i + 1 + effectiveSkip) % n
      const segs = []
      for (let di = 0; di < allEdgeRays.length; di++) {
        const end = starPts[di][i]
        segs.push({ origin: allEdgeRays[di][i].left.origin,      end, isA: true  })
        segs.push({ origin: allEdgeRays[di][jPair].right.origin, end, isA: false })
      }
      const va = vertices[i], vb = vertices[(i + 1) % n]
      const edgeLen = Math.sqrt((vb[0] - va[0]) ** 2 + (vb[1] - va[1]) ** 2)
      return { segs, edgeLen }
    })

    // No weave: push all segments flat
    if (!overlap || !thick) {
      for (const strand of strands) {
        for (const seg of strand.segs) allOver.push([seg.origin, seg.end])
      }
      continue
    }

    // ── Weave rendering ────────────────────────────────────────────────────────

    // Step 1: crossing adjacency — strands i and j are adjacent if any of their
    // segments actually intersect inside both extents.
    const adj = Array.from({ length: n }, () => [])
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let found = false
        outer: for (const sa of strands[i].segs) {
          for (const sb of strands[j].segs) {
            const ts = bandCrossParam(sa.origin, sa.end, sb.origin, sb.end)
            if (ts.some(t => t > -1e-4 && t < 1 - 1e-6)) { found = true; break outer }
          }
        }
        if (found) { adj[i].push(j); adj[j].push(i) }
      }
    }

    // Step 2: BFS 2-coloring per connected component.
    // colour 0 = over, colour 1 = under.
    // Components start as colour 1 so their first neighbour becomes colour 0,
    // matching the "left-ray (A) over right-ray (B)" convention at the first crossing.
    // Odd-cycle components fall back to the A-over-B rule.
    const colours  = new Array(n).fill(-1)
    const fallback = new Array(n).fill(false)

    for (let start = 0; start < n; start++) {
      if (colours[start] !== -1) continue
      colours[start] = 1
      const queue     = [start]
      const component = [start]
      let conflict    = false

      while (queue.length > 0) {
        const cur = queue.shift()
        for (const nb of adj[cur]) {
          if (colours[nb] === -1) {
            colours[nb] = 1 - colours[cur]
            queue.push(nb)
            component.push(nb)
          } else if (colours[nb] === colours[cur]) {
            conflict = true
          }
        }
      }

      if (conflict) {
        // Odd cycle (e.g. triangles): fall back to A-segs over, B-segs under
        for (const idx of component) fallback[idx] = true
      }
    }

    // Which segments of strand i go to allOver / allUnder?
    const overSegsOf  = i => fallback[i] ? strands[i].segs.filter(s => s.isA)
                                         : colours[i] === 0 ? strands[i].segs : []
    const underSegsOf = i => fallback[i] ? strands[i].segs.filter(s => !s.isA)
                                         : colours[i] === 1 ? strands[i].segs : []

    // Step 3: push over-segments whole
    for (let i = 0; i < n; i++) {
      for (const seg of overSegsOf(i)) allOver.push([seg.origin, seg.end])
    }

    // Step 4: push under-segments with individual per-crossing gaps.
    // For each adjacent over-strand, one gap interval is cut per crossing
    // (from first t to last t through that ribbon), then all intervals are merged.
    // This ensures multiple crossings with different over-strands each get their
    // own gap rather than being collapsed into one long blank span.
    for (let i = 0; i < n; i++) {
      const underS = underSegsOf(i)
      if (underS.length === 0) continue
      const { edgeLen } = strands[i]

      // Cache over-segs for each adjacent strand that actually has any
      const adjOverSegs = adj[i]
        .map(j => overSegsOf(j))
        .filter(segs => segs.length > 0)

      for (const seg of underS) {
        const sl = Math.sqrt((seg.end[0] - seg.origin[0]) ** 2 + (seg.end[1] - seg.origin[1]) ** 2)
        const extraG = sl > 1e-8 ? (overlapGap * edgeLen) / sl : 0

        const intervals = []
        for (const overSegs of adjOverSegs) {
          // Collect all t-values where this under-seg crosses this particular over-strand
          const ts = overSegs
            .flatMap(c => bandCrossParam(seg.origin, seg.end, c.origin, c.end))
            .map(t => Math.max(0, Math.min(1, t)))
            .filter(t => t >= 0 && t < 1 - 1e-6)
          if (ts.length === 0) continue
          // One contiguous gap per over-strand (entry to exit through its ribbon)
          intervals.push([Math.min(...ts) - extraG, Math.max(...ts) + extraG])
        }

        pushWithGaps(allUnder, seg.origin, seg.end, mergeIntervals(intervals))
      }
    }
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
    const effectiveSkip = n >= 6 ? skip : 0
    const [edges] = makeEdgeRays(vertices, thetaAt, delta, false, bandWidth)
    const c = centroid(vertices)

    const starPts = Array.from({ length: n }, (_, i) => {
      const j = (i + 1 + effectiveSkip) % n
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

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, skip = 0) {
  // Compute thetaAt once when in debug mode; reused by both region fills and ray visualisation.
  const thetaAt = debug
    ? buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)
    : null

  // Region fills drawn first so they sit behind the motif lines
  if (debug) drawHankinRegions(ctx, shapes, thetaAt, delta, bandWidth, skip)

  const { underSegs, overSegs } = getHankinSegments(shapes, theta, delta, thick, overlap, overlapGap, bandWidth, parquetDirection, thetaMin, thetaMax, parquetFunction, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale, skip)

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

      const effectiveSkip = n >= 6 ? skip : 0
      const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)
      for (let di = 0; di < allEdgeRays.length; di++) {
        const edges = allEdgeRays[di]
        for (let i = 0; i < n; i++) {
          const j = (i + 1 + effectiveSkip) % n
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

// ── Stained-glass rendering ───────────────────────────────────────────────────

// RGB triples for vivid stained-glass hues; assigned by region type so the
// same geometric region always gets the same colour within a draw call.
const GLASS_COLORS = [
  [200,  35,  35],   // ruby red
  [ 30,  60, 200],   // cobalt blue
  [ 25, 155,  55],   // emerald
  [155,  35, 195],   // amethyst
  [220, 155,  20],   // amber
  [ 20, 185, 185],   // teal
  [215,  90,  20],   // burnt orange
  [130, 210,  40],   // chartreuse
  [210,  35, 130],   // rose
  [ 40, 150, 220],   // sky blue
  [215, 130,  50],   // warm amber
  [ 90, 190, 140],   // jade
]

function glassRgba(idx, alpha) {
  const [r, g, b] = GLASS_COLORS[idx % GLASS_COLORS.length]
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

function drawGlassPane(ctx, pts, colorIdx, lightDx, lightDy, sc) {
  if (pts.length < 3) return
  let cx = 0, cy = 0
  for (const [x, y] of pts) { cx += x; cy += y }
  cx /= pts.length; cy /= pts.length
  let maxR = 0
  for (const [x, y] of pts) {
    const d = Math.hypot(x - cx, y - cy)
    if (d > maxR) maxR = d
  }
  maxR = Math.max(maxR, 2 / sc)

  const trace = () => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
  }

  ctx.save()

  // Base glass colour
  trace()
  ctx.fillStyle = glassRgba(colorIdx, 0.78)
  ctx.fill()

  // Chromatic dispersion — different wavelengths bend by different amounts through
  // the glass, producing a warm (red/orange) tint on the lit side and a cool
  // (blue/cyan) tint on the shadow side.  This is the most distinctive visible
  // signature of light refracting through a coloured medium.
  const dispGrad = ctx.createLinearGradient(
    cx + lightDx * maxR, cy + lightDy * maxR,   // lit side
    cx - lightDx * maxR, cy - lightDy * maxR    // shadow side
  )
  dispGrad.addColorStop(0,    'rgba(255,150, 40, 0.28)')   // warm orange — lit
  dispGrad.addColorStop(0.42, 'rgba(255,255,255, 0.04)')
  dispGrad.addColorStop(0.58, 'rgba(255,255,255, 0.04)')
  dispGrad.addColorStop(1,    'rgba( 40, 90, 255, 0.22)')  // cool blue  — shadow
  trace()
  ctx.fillStyle = dispGrad
  ctx.fill()

  // Refraction depth gradient — radial, brighter where light enters most directly,
  // darker at the far edge.  Reinforces the sense of thickness.
  const hcx = cx + lightDx * maxR * 0.38
  const hcy = cy + lightDy * maxR * 0.38
  const refractGrad = ctx.createRadialGradient(hcx, hcy, 0, cx, cy, maxR * 1.05)
  refractGrad.addColorStop(0,    'rgba(255,255,255,0.32)')
  refractGrad.addColorStop(0.35, 'rgba(255,255,255,0.08)')
  refractGrad.addColorStop(0.70, 'rgba(0,0,0,0.04)')
  refractGrad.addColorStop(1,    'rgba(0,0,0,0.30)')
  trace()
  ctx.fillStyle = refractGrad
  ctx.fill()

  // Caustic band — a bright diagonal streak running perpendicular to the light
  // direction, clipped inside the pane.  This is the most visible sign of glass
  // bending and focusing light; its position varies per region type so adjacent
  // panes look independent rather than identical.
  trace()
  ctx.save()
  ctx.clip()
  const perpDx = -lightDy, perpDy = lightDx   // perpendicular to light direction
  const bandPos = ((colorIdx * 0.618) % 1.0) - 0.5   // golden-ratio spread, ±0.5
  const bx = cx + perpDx * bandPos * maxR * 1.4
  const by = cy + perpDy * bandPos * maxR * 1.4
  const bHalfW = maxR * 0.20   // half-width of the caustic band (in light direction)
  const bLen   = maxR * 5      // long enough to cross any polygon (clipped anyway)
  const bandGrad = ctx.createLinearGradient(
    bx + lightDx * bHalfW, by + lightDy * bHalfW,
    bx - lightDx * bHalfW, by - lightDy * bHalfW
  )
  bandGrad.addColorStop(0,   'rgba(255,255,255,0)')
  bandGrad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  bandGrad.addColorStop(1,   'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.moveTo(bx + perpDx * bLen + lightDx * bHalfW, by + perpDy * bLen + lightDy * bHalfW)
  ctx.lineTo(bx - perpDx * bLen + lightDx * bHalfW, by - perpDy * bLen + lightDy * bHalfW)
  ctx.lineTo(bx - perpDx * bLen - lightDx * bHalfW, by - perpDy * bLen - lightDy * bHalfW)
  ctx.lineTo(bx + perpDx * bLen - lightDx * bHalfW, by + perpDy * bLen - lightDy * bHalfW)
  ctx.closePath()
  ctx.fillStyle = bandGrad
  ctx.fill()
  ctx.restore()

  // Caustic hot spot — small bright specular near the lit-side entry point.
  const scx2 = cx + lightDx * maxR * 0.55
  const scy2 = cy + lightDy * maxR * 0.55
  const causticGrad = ctx.createRadialGradient(scx2, scy2, 0, scx2, scy2, maxR * 0.30)
  causticGrad.addColorStop(0, 'rgba(255,255,255,0.42)')
  causticGrad.addColorStop(1, 'rgba(255,255,255,0)')
  trace()
  ctx.fillStyle = causticGrad
  ctx.fill()

  // Inner edge shadow — dark bevel at perimeter reads as glass thickness.
  trace()
  ctx.save()
  ctx.clip()
  trace()
  ctx.strokeStyle = 'rgba(0,0,0,0.42)'
  ctx.lineWidth = 6 / sc
  ctx.stroke()
  ctx.restore()

  // Inner edge highlight — bright rim where the glass edge catches the light.
  trace()
  ctx.save()
  ctx.clip()
  trace()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2 / sc
  ctx.stroke()
  ctx.restore()

  ctx.restore()
}

function drawLeadCame(ctx, segs, lightDx, lightDy, sc) {
  if (segs.length === 0) return
  const cameW = 3.5 / sc
  const hlW   = 0.8  / sc
  const hlOff = 1.3  / sc

  ctx.save()
  ctx.lineCap  = 'round'
  ctx.lineJoin = 'round'

  // Dark came body
  ctx.strokeStyle = '#0c0c20'
  ctx.lineWidth   = cameW
  for (const [p1, p2] of segs) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }

  // Specular highlight on the lit face of the came — offset by one came-half-width
  // toward the light source direction.
  ctx.strokeStyle = 'rgba(255,255,255,0.52)'
  ctx.lineWidth   = hlW
  for (const [p1, p2] of segs) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const nx = -dy / len, ny = dx / len
    const side = (nx * lightDx + ny * lightDy) > 0 ? 1 : -1
    const ox = nx * side * hlOff, oy = ny * side * hlOff
    ctx.beginPath()
    ctx.moveTo(p1[0] + ox, p1[1] + oy)
    ctx.lineTo(p2[0] + ox, p2[1] + oy)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawGlass(ctx, shapes, theta = Math.PI / 4, delta = 0,
  thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2,
  parquetDirection = 'none', thetaMin = theta, thetaMax = theta,
  parquetFunction = 'wave-ltr', time = 0, speed = 1,
  linearAngle = 0, centerX = 0, centerY = 0,
  ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1, skip = 0) {

  const sc = ctx.getTransform?.().a ?? 1
  // Light arrives from the upper-left (canvas coords: negative x, negative y).
  const LIGHT_DX = -0.707, LIGHT_DY = -0.707

  const thetaAt = buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax,
    time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)

  const colorMap = new Map()
  let nextColorIdx = 0
  const colorIdxFor = key => {
    if (!colorMap.has(key)) colorMap.set(key, nextColorIdx++ % GLASS_COLORS.length)
    return colorMap.get(key)
  }

  const SNAP = 0.5
  const vertexMap = new Map()

  ctx.save()

  for (const shape of shapes) {
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)
    const n = vertices.length
    const effectiveSkip = n >= 6 ? skip : 0
    const [edges] = makeEdgeRays(vertices, thetaAt, delta, false, bandWidth)
    const c = centroid(vertices)

    const starPts = Array.from({ length: n }, (_, i) => {
      const j = (i + 1 + effectiveSkip) % n
      const rayA = edges[i].left, rayB = edges[j].right
      const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
      return (pt && pointInPolygon(pt, vertices))
        ? pt
        : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
    })

    const tileMids = Array.from({ length: n }, (_, i) => {
      const a = vertices[i], b = vertices[(i + 1) % n]
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    })

    const tilePoly = [...starPts, ...tileMids]
      .sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]))
    drawGlassPane(ctx, tilePoly, colorIdxFor(`t${n}`), LIGHT_DX, LIGHT_DY, sc)

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
      for (const mid of [tileMids[k], tileMids[(k - 1 + n) % n]]) {
        if (!vm.edgeMids.some(m => Math.abs(m[0] - mid[0]) < SNAP && Math.abs(m[1] - mid[1]) < SNAP))
          vm.edgeMids.push(mid)
      }
    }
  }

  for (const { pos: v, stars, edgeMids } of vertexMap.values()) {
    if (stars.length < 3) continue
    const uniq = stars.filter((e, idx) =>
      stars.findIndex(f =>
        Math.abs(f.pt[0] - e.pt[0]) < SNAP &&
        Math.abs(f.pt[1] - e.pt[1]) < SNAP) === idx)
    if (uniq.length < 3) continue
    const allPts = [...uniq.map(e => e.pt), ...edgeMids]
      .sort((a, b) =>
        Math.atan2(a[1] - v[1], a[0] - v[0]) - Math.atan2(b[1] - v[1], b[0] - v[0]))
    const nsKey = uniq.map(e => e.tileN).sort((a, b) => a - b).join('.')
    drawGlassPane(ctx, allPts, colorIdxFor(`v${uniq.length}.${nsKey}`), LIGHT_DX, LIGHT_DY, sc)
  }

  const { underSegs, overSegs } = getHankinSegments(
    shapes, theta, delta, thick, overlap, overlapGap, bandWidth,
    parquetDirection, thetaMin, thetaMax, parquetFunction, time, speed,
    linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale, skip)
  drawLeadCame(ctx, [...underSegs, ...overSegs], LIGHT_DX, LIGHT_DY, sc)

  ctx.restore()
}
