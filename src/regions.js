import { getHankinSegments } from './hankin'

const SNAP = 0.1

function snapKey(x, y) {
  return `${Math.round(x / SNAP)},${Math.round(y / SNAP)}`
}

function signedArea(poly) {
  let area = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n]
    area += ax * by - bx * ay
  }
  return area / 2
}

function buildGraph(segments) {
  const vertMap = new Map()
  const verts = []
  const adj = []

  function getVert(x, y) {
    const k = snapKey(x, y)
    if (vertMap.has(k)) return vertMap.get(k)
    const idx = verts.length
    vertMap.set(k, idx)
    verts.push([x, y])
    adj.push([])
    return idx
  }

  const edgeSet = new Set()

  for (const [[ax, ay], [bx, by]] of segments) {
    const u = getVert(ax, ay)
    const v = getVert(bx, by)
    if (u === v) continue
    const ekey = u < v ? `${u},${v}` : `${v},${u}`
    if (edgeSet.has(ekey)) continue
    edgeSet.add(ekey)

    adj[u].push({ to: v, angle: Math.atan2(by - ay, bx - ax) })
    adj[v].push({ to: u, angle: Math.atan2(ay - by, ax - bx) })
  }

  for (const list of adj) list.sort((a, b) => a.angle - b.angle)

  return { verts, adj }
}

function findFaces(verts, adj) {
  const dirIdx = new Map()
  for (let u = 0; u < adj.length; u++)
    for (let k = 0; k < adj[u].length; k++)
      dirIdx.set(`${u},${adj[u][k].to}`, k)

  function nextHalfEdge(u, v) {
    const pos = dirIdx.get(`${v},${u}`)
    if (pos === undefined) return null
    const adjV = adj[v]
    return adjV[(pos - 1 + adjV.length) % adjV.length].to
  }

  const visited = new Set()
  const faces = []
  const limit = adj.length * 4 + 100

  for (let u = 0; u < adj.length; u++) {
    for (const { to: v0 } of adj[u]) {
      if (visited.has(`${u},${v0}`)) continue
      const face = []
      let cu = u, cv = v0, steps = 0
      while (steps++ < limit) {
        const key = `${cu},${cv}`
        if (visited.has(key)) break
        visited.add(key)
        face.push(verts[cu])
        const nw = nextHalfEdge(cu, cv)
        if (nw === null) break
        cu = cv; cv = nw
        if (cu === u && cv === v0) break
      }
      if (face.length >= 3) faces.push(face)
    }
  }

  return faces
}

// Canonical rotation-invariant key: sequence of (normalised-edge-len, turning-angle) pairs,
// rotated to the lexicographically smallest form.
function polygonKey(poly) {
  const n = poly.length
  const lengths = Array.from({ length: n }, (_, i) => {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n]
    return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
  })
  const angles = Array.from({ length: n }, (_, i) => {
    const [px, py] = poly[(i - 1 + n) % n]
    const [cx, cy] = poly[i]
    const [nx, ny] = poly[(i + 1) % n]
    const d1x = cx - px, d1y = cy - py, d2x = nx - cx, d2y = ny - cy
    return Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y)
  })

  const minLen = Math.min(...lengths)
  const nl = lengths.map(l => Math.round(l / minLen * 20))
  const na = angles.map(a => Math.round(a * 180 / Math.PI))

  let best = null
  for (let start = 0; start < n; start++) {
    const key = `${n}:` + Array.from({ length: n }, (_, k) =>
      `${nl[(start + k) % n]}_${na[(start + k) % n]}`
    ).join('|')
    if (best === null || key < best) best = key
  }
  return best
}

export function computeRegions(shapes, theta, delta, thick, bandWidth, parquetDirection, thetaMin, thetaMax, parquetFunction, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale) {
  const { underSegs, overSegs } = getHankinSegments(
    shapes, theta, delta,
    thick, false, 0, bandWidth,
    parquetDirection, thetaMin, thetaMax,
    parquetFunction, 0, 1,
    linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale
  )

  const allSegs = [...underSegs, ...overSegs]
  if (allSegs.length === 0) return []

  const { verts, adj } = buildGraph(allSegs)
  const faces = findFaces(verts, adj)

  // Interior faces have positive signed area in canvas coords (y-down)
  const interior = faces.filter(f => signedArea(f) > 0)
  if (interior.length === 0) return []

  const areas = interior.map(f => signedArea(f))
  const sorted = [...areas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // Discard very large faces (outer/background) and tiny noise slivers
  const filtered = interior.filter((_, i) =>
    areas[i] < median * 50 && areas[i] > median * 0.02
  )

  const byKey = new Map()
  for (const face of filtered) {
    const key = polygonKey(face)
    if (key && !byKey.has(key)) byKey.set(key, face)
  }

  return Array.from(byKey.values())
}

// Returns a scale factor so the largest region fills (size - 2*padding) in its cell.
// Pass this to regionToSVGString to keep all regions at consistent relative sizes.
export function computeRegionScale(regions, size, padding) {
  let maxDim = 0
  for (const poly of regions) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
    maxDim = Math.max(maxDim, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  }
  return maxDim > 0 ? (size - 2 * padding) / maxDim : 1
}

// scale: if provided, all regions use the same scale (for relative-size display).
//        If null, each region is independently fitted to the viewBox.
export function regionToSVGString(poly, size = 200, padding = 20, forExport = false, scale = null) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX || 1, h = maxY - minY || 1
  const sc = scale ?? (size - 2 * padding) / Math.max(w, h)
  const ox = (size - (minX + maxX) * sc) / 2
  const oy = (size - (minY + maxY) * sc) / 2

  const pts = poly.map(([x, y]) =>
    `${(x * sc + ox).toFixed(2)},${(y * sc + oy).toFixed(2)}`
  )
  const d = `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`

  const bg = forExport ? `<rect width="${size}" height="${size}" fill="white"/>` : ''
  const fill = forExport ? 'rgba(180,180,255,0.15)' : 'rgba(180,180,255,0.2)'
  const stroke = forExport ? '#333' : '#aaa'
  const sw = forExport ? '1.5' : '1.2'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bg}<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`
}
