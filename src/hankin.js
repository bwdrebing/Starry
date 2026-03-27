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

export function drawHankin(ctx, shapes, theta = Math.PI / 4, delta = 0, debug = false) {
  for (const shape of shapes) {
    const vertices = shape[0]
    if (!vertices || vertices.length < 3) continue

    const n = vertices.length
    const edges = makeEdgeRays(vertices, theta, delta)

    for (let i = 0; i < n; i++) {
      // Check each ray from edge i against all rays from the two adjacent edges.
      // Whichever adjacent ray gives a valid forward intersection (both t > 0 and s > 0)
      // is the correct partner — the geometry picks the right pairing automatically.
      const adjacentRays = [
        ...Object.values(edges[(i - 1 + n) % n]),
        ...Object.values(edges[(i + 1) % n]),
      ]

      for (const ray of [edges[i].left, edges[i].right]) {
        let endpoint = null
        let bestT = Infinity

        for (const other of adjacentRays) {
          const result = rayIntersect(ray.origin, ray.dir, other.origin, other.dir)
          if (result && result[0] < bestT) {
            bestT = result[0]
            endpoint = result[2]
          }
        }

        endpoint ??= rayExitPolygon(ray.origin, ray.dir, vertices)

        if (endpoint) {
          ctx.beginPath()
          ctx.moveTo(ray.origin[0], ray.origin[1])
          ctx.lineTo(endpoint[0], endpoint[1])
          ctx.stroke()

          if (debug) {
            const r = 3 / (ctx.getTransform?.().a ?? 1)
            ctx.save()
            ctx.fillStyle = 'red'
            ctx.beginPath()
            ctx.arc(endpoint[0], endpoint[1], r, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        }
      }
    }
  }
}
