// Hankin "Polygons in Contact" algorithm.
// Each polygon edge generates two rays angled inward at ±θ from the inward normal.
// The right ray of edge i pairs *only* with the left ray of adjacent edge i+1.
// These converge at a star point; both are drawn from their origin to that point.

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
// Both t and s must be positive (rays go forward).
function rayIntersect(o1, d1, o2, d2) {
  const denom = cross2D(d1, d2)
  if (Math.abs(denom) < 1e-10) return null
  const diff = sub2D(o2, o1)
  const t = cross2D(diff, d2) / denom
  const s = cross2D(diff, d1) / denom
  if (t < 1e-6 || s < 1e-6) return null
  return [t, s, add2D(o1, scale2D(d1, t))]
}

// Ray-casting point-in-polygon test.
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

// Returns the point where a ray (origin + t*dir, t > 0) first exits the polygon.
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

// Builds per-edge ray pairs, returning an array of edge-ray variants:
//   one variant for non-thick mode, two (inner + outer band) for thick mode.
//
// thetaAt is a function (x, y) => theta evaluated at each edge's midpoint.
// halfThickDelta is also computed per-edge from thetaAt(mid) so that both tiles
// sharing an edge use the same band offsets, keeping thick-band lines continuous
// across tile boundaries.
function makeEdgeRays(vertices, thetaAt, delta, thick = false, bandWidth = 0.2) {
  const n = vertices.length
  const c = centroid(vertices)

  // Build one array of edge-ray objects for a given per-edge delta function.
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
      // oLeft is offset toward vertex[i] (shared corner with edge i-1)
      // oRight is offset toward vertex[(i+1)%n] (shared corner with edge i+1)
      const oLeft = sub2D(mid, scale2D(edgeDir, offset))
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

// Returns a copy of vertices guaranteed to be in clockwise order.
function ensureClockwise(vertices) {
  let area = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const [ax, ay] = vertices[i]
    const [bx, by] = vertices[(i + 1) % n]
    area += ax * by - bx * ay
  }
  // area > 0 means CCW — reverse to make CW
  return area > 0 ? [...vertices].reverse() : vertices
}

// Returns an array of t parameters (along segment a→b) for occlusion by segment c→d.
// Normal case: one t where the lines cross (only if crossing is within c→d's extent).
// Collinear case: two t values [t0, t1] bracketing the projected overlap of c→d onto a→b.
// Returns [] when c→d neither crosses nor overlaps a→b.
// t values are NOT clamped — caller clamps to [0,1].
function bandCrossParam(a, b, c, d) {
  const dab = [b[0] - a[0], b[1] - a[1]]
  const dcd = [d[0] - c[0], d[1] - c[1]]
  const denom = cross2D(dab, dcd)
  if (Math.abs(denom) < 1e-10) {
    // Parallel — check if collinear (perpendicular distance ≈ 0)
    const lenAB2 = dab[0] ** 2 + dab[1] ** 2
    if (lenAB2 < 1e-10) return []
    const perp = Math.abs(cross2D(sub2D(c, a), dab)) / Math.sqrt(lenAB2)
    if (perp > 1e-4) return []
    // Collinear: project c and d onto a→b as t parameters and return the overlap interval
    const tc = dot2D(sub2D(c, a), dab) / lenAB2
    const td = dot2D(sub2D(d, a), dab) / lenAB2
    const t0 = Math.min(tc, td), t1 = Math.max(tc, td)
    if (t1 - t0 < 1e-6) return []
    return [t0, t1]
  }
  const diff = sub2D(c, a)
  const t = cross2D(diff, dcd) / denom
  const s = cross2D(diff, dab) / denom
  if (s < -1e-4 || s > 1 + 1e-4) return []      // crossing is outside c→d's extent
  return [t]                                       // t may be outside [0,1] — caller clamps
}

// Pushes sub-segments of origin→end into segs, with the band gap [tGapStart, tGapEnd]
// removed. extraGap (in world units) adds margin on each side.
function pushWithBandGap(segs, origin, end, dir, tGapStart, tGapEnd, extraGap) {
  const len = Math.sqrt((end[0] - origin[0]) ** 2 + (end[1] - origin[1]) ** 2)
  const extra = len > 1e-8 ? extraGap / len : 0
  const t0 = tGapStart - extra
  const t1 = tGapEnd   + extra
  const lerp = t => [origin[0] + t * (end[0] - origin[0]), origin[1] + t * (end[1] - origin[1])]
  const fwd  = (a, b) => (b[0] - a[0]) * dir[0] + (b[1] - a[1]) * dir[1] > 1e-6

  const gapStart = lerp(t0)
  const gapEnd   = lerp(t1)
  if (fwd(origin, gapStart)) segs.push([origin, gapStart])
  if (fwd(gapEnd,  end))     segs.push([gapEnd, end])
}

// Builds a thetaAt(x, y) function for the given parquet settings.
// Bounds are derived from all shape vertices so edge midpoints always fall
// within the normalised [0, 1] range.
function buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed,
                      linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1) {
  if (parquetDirection === 'none') return () => theta

  const lerp = w => thetaMin + Math.max(0, Math.min(1, w)) * (thetaMax - thetaMin)

  // Collect spatial bounds from all vertices (covers the full canvas extent).
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
    // Project vertices onto the gradient direction to find the extent, then normalise.
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

export function getHankinSegments(shapes, theta = Math.PI / 4, delta = 0, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1) {
  const allUnder = [], allOver = []

  // Build a position→theta mapping. Edge midpoints are used as the sample point
  // so that both tiles sharing an edge compute the same theta, giving seamless
  // continuity across tile boundaries.
  const thetaAt = buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)

  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si]
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)
    const n = vertices.length

    const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)
    const sp = allEdgeRays.map(edges =>
      Array.from({ length: n }, (_, i) => {
        const j = (i + 1) % n
        const rayA = edges[i].left, rayB = edges[j].right
        const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
        const ptInside = pt && pointInPolygon(pt, vertices)
        const end = ptInside ? pt : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
        return { endA: end, endB: end }
      })
    )

    // Build per-band geometry. aSegs = A+ rays (left ray of edge i, origin on edge i).
    // bSegs = B- rays (right ray of edge i+1, origin on edge i+1).
    const bands = Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n
      const va = vertices[i], vb = vertices[j]
      const edgeLen = Math.sqrt((vb[0] - va[0]) ** 2 + (vb[1] - va[1]) ** 2)
      const aSegs = [], bSegs = []
      for (let di = 0; di < allEdgeRays.length; di++) {
        const end = sp[di][i].endA
        aSegs.push({ origin: allEdgeRays[di][i].left.origin,  dir: allEdgeRays[di][i].left.dir,  end })
        bSegs.push({ origin: allEdgeRays[di][j].right.origin, dir: allEdgeRays[di][j].right.dir, end })
      }
      return { aSegs, bSegs, edgeLen }
    })

    // Draw each band clipped by band(i+1) (clockwise-next goes on top).
    // A+ segments go from edge i toward M — they pass behind band(i+1) at their END,
    // so draw from origin to the first crossing with band(i+1).
    // B- segments go from edge i+1 toward M — they start behind band(i+1) (same edge),
    // so draw from the last crossing with band(i+1) to M.
    const lerpPt = (seg, t) => [
      seg.origin[0] + t * (seg.end[0] - seg.origin[0]),
      seg.origin[1] + t * (seg.end[1] - seg.origin[1]),
    ]
    const segLen = seg => Math.sqrt((seg.end[0] - seg.origin[0]) ** 2 + (seg.end[1] - seg.origin[1]) ** 2)

    for (let i = 0; i < n; i++) {
      const { aSegs, bSegs, edgeLen } = bands[i]
      const nextSegs = [...bands[(i + 1) % n].aSegs, ...bands[(i + 1) % n].bSegs]
      const extraGap = overlapGap * edgeLen

      const crossings = seg => nextSegs
        .flatMap(c => bandCrossParam(seg.origin, seg.end, c.origin, c.end))
        .map(t => Math.max(0, Math.min(1, t)))
        .sort((a, b) => a - b)

      const process = (segs, list) => {
        for (const seg of segs) {
          if (overlap && thick) {
            const ts = crossings(seg)
            if (ts.length > 0) {
              const g = extraGap / segLen(seg)
              const t0 = Math.max(0, ts[0] - g)
              const t1 = Math.min(1, ts[ts.length - 1] + g)
              if (t0 > 1e-6)       list.push([seg.origin, lerpPt(seg, t0)])
              if (t1 < 1 - 1e-6)  list.push([lerpPt(seg, t1), seg.end])
            } else {
              list.push([seg.origin, seg.end])
            }
          } else {
            list.push([seg.origin, seg.end])
          }
        }
      }

      process(aSegs, allOver)
      process(bSegs, allUnder)
    }
  }

  return { underSegs: allUnder, overSegs: allOver }
}

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false, overlapGap = 0.05, bandWidth = 0.2, parquetDirection = 'none', thetaMin = theta, thetaMax = theta, parquetFunction = 'wave-ltr', time = 0, speed = 1, linearAngle = 0, centerX = 0, centerY = 0, ellipseAngle = 0, ellipseMajorScale = 1, ellipseMinorScale = 1) {
  const { underSegs, overSegs } = getHankinSegments(shapes, theta, delta, thick, overlap, overlapGap, bandWidth, parquetDirection, thetaMin, thetaMax, parquetFunction, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)

  for (const [p1, p2] of underSegs) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }
  for (const [p1, p2] of overSegs) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }

  if (debug) {
    const thetaAt = buildThetaAt(shapes, parquetDirection, parquetFunction, theta, thetaMin, thetaMax, time, speed, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale)
    const r = 3 / (ctx.getTransform?.().a ?? 1)
    ctx.save()
    ctx.lineWidth = 1 / (ctx.getTransform?.().a ?? 1)

    for (const shape of shapes) {
      const raw = shape[0]
      if (!raw || raw.length < 3) continue
      const vertices = ensureClockwise(raw)
      const n = vertices.length

      const allEdgeRays = makeEdgeRays(vertices, thetaAt, delta, thick, bandWidth)
      for (let di = 0; di < allEdgeRays.length; di++) {
        const edges = allEdgeRays[di]
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n
          const rayA = edges[i].left, rayB = edges[j].right
          const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
          const ptInside = pt && pointInPolygon(pt, vertices)
          const end = ptInside ? pt : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]
          const endA = end, endB = end
          if (!endA || !endB) continue

          const hue = (i / n) * 360
          const lightness = di === 0 ? 55 : 75
          const color = `hsl(${hue}, 90%, ${lightness}%)`
          ctx.strokeStyle = color
          ctx.fillStyle = color

          ctx.beginPath(); ctx.moveTo(rayA.origin[0], rayA.origin[1]); ctx.lineTo(endA[0], endA[1]); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(rayB.origin[0], rayB.origin[1]); ctx.lineTo(endB[0], endB[1]); ctx.stroke()
          ctx.beginPath(); ctx.arc(endA[0], endA[1], r, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    ctx.restore()
  }
}
