// Hankin "Polygons in Contact" algorithm
// For each polygon edge, two rays are cast inward at ±θ from the edge's inward normal.
// Each ray is drawn from the edge midpoint to its closest intersection with another ray.

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

// Returns [t, point] for the intersection of ray (o1+t*d1) and (o2+s*d2), or null.
function rayIntersect(o1, d1, o2, d2) {
  const denom = cross2D(d1, d2)
  if (Math.abs(denom) < 1e-10) return null
  const diff = sub2D(o2, o1)
  const t = cross2D(diff, d2) / denom
  const s = cross2D(diff, d1) / denom
  if (t < 1e-6 || s < -1e-6) return null
  return [t, add2D(o1, scale2D(d1, t))]
}

// Returns true if pt is inside (or on the boundary of) a convex polygon.
// Works regardless of winding order.
function insideConvexPolygon(pt, vertices) {
  const n = vertices.length
  let pos = 0, neg = 0
  for (let i = 0; i < n; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % n]
    const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])
    if (cross > 1e-4) pos++
    else if (cross < -1e-4) neg++
    if (pos > 0 && neg > 0) return false
  }
  return true
}

function centroid(vertices) {
  const n = vertices.length
  return [
    vertices.reduce((sum, v) => sum + v[0], 0) / n,
    vertices.reduce((sum, v) => sum + v[1], 0) / n,
  ]
}

// delta offsets each ray's origin along the edge from the midpoint (0 = both at midpoint)
function makeRays(vertices, theta, delta = 0) {
  const n = vertices.length
  const c = centroid(vertices)
  const rays = []

  for (let i = 0; i < n; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % n]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const edgeDir = norm2D(sub2D(b, a))
    const edgeLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    let normal = rotate2D(edgeDir, Math.PI / 2)

    // Ensure normal points inward (toward centroid)
    if (dot2D(normal, sub2D(c, mid)) < 0) {
      normal = [-normal[0], -normal[1]]
    }

    const offset = delta * edgeLen * 0.5
    const o1 = sub2D(mid, scale2D(edgeDir, offset))
    const o2 = add2D(mid, scale2D(edgeDir, offset))

    rays.push({ origin: o1, dir: rotate2D(normal, +theta), edge: i })
    rays.push({ origin: o2, dir: rotate2D(normal, -theta), edge: i })
  }

  return rays
}

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0) {
  for (const shape of shapes) {
    const vertices = shape[0]
    if (!vertices || vertices.length < 3) continue

    const rays = makeRays(vertices, theta, delta)

    for (const ray of rays) {
      let bestT = Infinity
      let bestPt = null

      for (const other of rays) {
        if (other.edge === ray.edge) continue
        const result = rayIntersect(ray.origin, ray.dir, other.origin, other.dir)
        if (result) {
          const [t, pt] = result
          if (t < bestT && insideConvexPolygon(pt, vertices)) { bestT = t; bestPt = pt }
        }
      }

      if (bestPt) {
        ctx.beginPath()
        ctx.moveTo(ray.origin[0], ray.origin[1])
        ctx.lineTo(bestPt[0], bestPt[1])
        ctx.stroke()
      }
    }
  }
}
