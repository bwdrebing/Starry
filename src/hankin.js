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

// Builds per-edge ray pairs. For edge i:
//   left ray  — origin offset toward edge i-1's corner, direction = rotate(normal, +theta)
//   right ray — origin offset toward edge i+1's corner, direction = rotate(normal, -theta)
function makeEdgeRays(vertices, theta, delta) {
  const n = vertices.length
  const c = centroid(vertices)
  const edges = []

  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const edgeDir = norm2D(sub2D(b, a))
    const edgeLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    let normal = rotate2D(edgeDir, Math.PI / 2)
    if (dot2D(normal, sub2D(c, mid)) < 0) normal = [-normal[0], -normal[1]]

    const offset = delta * edgeLen * 0.5
    // oLeft is offset toward vertex[i] (shared corner with edge i-1)
    // oRight is offset toward vertex[(i+1)%n] (shared corner with edge i+1)
    const oLeft = sub2D(mid, scale2D(edgeDir, offset))
    const oRight = add2D(mid, scale2D(edgeDir, offset))

    edges.push({
      left:  { origin: oLeft,  dir: rotate2D(normal, +theta) },
      right: { origin: oRight, dir: rotate2D(normal, -theta) },
    })
  }
  return edges
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

// Returns t ∈ (0,1) where segment a→b is crossed by segment c→d, or null.
function segmentCrossParam(a, b, c, d) {
  const dab = [b[0] - a[0], b[1] - a[1]]
  const dcd = [d[0] - c[0], d[1] - c[1]]
  const denom = cross2D(dab, dcd)
  if (Math.abs(denom) < 1e-10) return null
  const diff = sub2D(c, a)
  const t = cross2D(diff, dcd) / denom
  const s = cross2D(diff, dab) / denom
  if (t < 1e-4 || t > 1 - 1e-4 || s < 0 || s > 1) return null
  return t
}

// Pushes sub-segments of origin→end into segs, with gaps cut at each crossing t value.
function pushWithGaps(segs, origin, end, dir, crossings, halfGap) {
  let prevPt = origin
  for (const t of crossings) {
    const cx = origin[0] + t * (end[0] - origin[0])
    const cy = origin[1] + t * (end[1] - origin[1])
    const before = [cx - dir[0] * halfGap, cy - dir[1] * halfGap]
    const after  = [cx + dir[0] * halfGap, cy + dir[1] * halfGap]
    // only push if the sub-segment goes forward
    if ((before[0] - prevPt[0]) * dir[0] + (before[1] - prevPt[1]) * dir[1] > 1e-6)
      segs.push([prevPt, before])
    prevPt = after
  }
  if ((end[0] - prevPt[0]) * dir[0] + (end[1] - prevPt[1]) * dir[1] > 1e-6)
    segs.push([prevPt, end])
}

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0, debug = false, thick = false, overlap = false) {
  const deltas = thick ? [delta - 0.25, delta + 0.25] : [delta]

  for (const shape of shapes) {
    const raw = shape[0]
    if (!raw || raw.length < 3) continue
    const vertices = ensureClockwise(raw)
    const n = vertices.length

    // Precompute edge rays and star-point endpoints for each delta pass.
    // sp[di][i] = { endA, endB } for pair (i, i+1) at delta index di.
    const allEdgeRays = deltas.map(d => makeEdgeRays(vertices, theta, d))
    const sp = allEdgeRays.map(edges =>
      Array.from({ length: n }, (_, i) => {
        const j = (i + 1) % n
        const rayA = edges[i].left, rayB = edges[j].right
        const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
        return {
          endA: pt ?? rayExitPolygon(rayA.origin, rayA.dir, vertices),
          endB: pt ?? rayExitPolygon(rayB.origin, rayB.dir, vertices),
        }
      })
    )

    const underSegs = [], overSegs = [], debugPts = []

    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n
      const va = vertices[i], vb = vertices[(i + 1) % n]
      const edgeLen = Math.sqrt((vb[0] - va[0]) ** 2 + (vb[1] - va[1]) ** 2)

      // B+ segments: left ray of edge i (one per delta pass), end = star point for pair (i, i+1)
      const bplus = allEdgeRays.map((edges, di) => {
        const ray = edges[i].left
        const end = sp[di][i].endA
        return end ? { origin: ray.origin, dir: ray.dir, end } : null
      }).filter(Boolean)

      // B- segments: right ray of edge i (one per delta pass), end = star point for pair (prev, i)
      const bminus = allEdgeRays.map((edges, di) => {
        const ray = edges[i].right
        const end = sp[di][prev].endB
        return end ? { origin: ray.origin, dir: ray.dir, end } : null
      }).filter(Boolean)

      // B+ is always on top
      for (const seg of bplus) overSegs.push([seg.origin, seg.end])

      // For B-, find where each B+ line crosses it and apply Celtic-knot gaps
      // Gap half-width derived from B+ strap width projected onto B- direction.
      const halfGap = 0.0625 * edgeLen / Math.sin(theta)

      for (const bm of bminus) {
        if (overlap && thick) {
          const crossings = bplus
            .map(bp => segmentCrossParam(bm.origin, bm.end, bp.origin, bp.end))
            .filter(t => t !== null)
            .sort((a, b) => a - b)
          pushWithGaps(underSegs, bm.origin, bm.end, bm.dir, crossings, halfGap)
        } else {
          underSegs.push([bm.origin, bm.end])
        }
      }

      if (debug) {
        for (let di = 0; di < deltas.length; di++)
          if (sp[di][i].endA) debugPts.push(sp[di][i].endA)
      }
    }

    for (const [p1, p2] of underSegs) {
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
    }
    for (const [p1, p2] of overSegs) {
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
    }
    if (debugPts.length) {
      const r = 3 / (ctx.getTransform?.().a ?? 1)
      ctx.save(); ctx.fillStyle = 'red'
      for (const [x, y] of debugPts) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
      ctx.restore()
    }
  }
}
