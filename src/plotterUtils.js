/**
 * SVG optimisation utilities for pen-plotter export.
 *
 * Pipeline:
 *   1. joinSegments     – chain [[p1,p2], ...] segments that share endpoints
 *                         into longer polylines, reducing pen lifts.
 *   2. sortPathsByTravel – greedy nearest-neighbour reorder to minimise
 *                         pen-up travel distance between paths.
 *   3. polylinePath     – serialise a polyline to an SVG path d-string.
 *   4. optimiseForPlotter – full pipeline returning d-strings.
 */

// Two endpoints are considered the same if they are within SNAP canvas units.
const SNAP = 0.01

function snapKey(x, y) {
  return `${Math.round(x / SNAP)},${Math.round(y / SNAP)}`
}

function dist2([ax, ay], [bx, by]) {
  return (ax - bx) ** 2 + (ay - by) ** 2
}

/**
 * Join an array of [[p1, p2], ...] segments into longer polylines by
 * following chains of connected endpoints.  Returns an array of polylines,
 * each being an array of [x, y] points.
 *
 * At branch-points (three or more segments meeting at one point) the
 * algorithm greedily picks the first available neighbour, which keeps the
 * implementation O(n) while still producing usefully long chains in the
 * dense, tree-like Hankin graphs.
 */
export function joinSegments(segs) {
  if (segs.length === 0) return []

  // adj: snap-key → [{segIdx, end: 0=p1-end | 1=p2-end}]
  const adj = new Map()
  function addEntry(key, segIdx, end) {
    let list = adj.get(key)
    if (!list) { list = []; adj.set(key, list) }
    list.push({ segIdx, end })
  }

  for (let i = 0; i < segs.length; i++) {
    const [p1, p2] = segs[i]
    addEntry(snapKey(p1[0], p1[1]), i, 0)
    addEntry(snapKey(p2[0], p2[1]), i, 1)
  }

  const used = new Uint8Array(segs.length)

  // Grow pts forward: look for an unused segment whose p1 or p2 matches the
  // current tail, append the other endpoint, and repeat.
  function extendForward(pts) {
    for (;;) {
      const tail = pts[pts.length - 1]
      const neighbors = adj.get(snapKey(tail[0], tail[1]))
      if (!neighbors) break
      let found = false
      for (const { segIdx, end } of neighbors) {
        if (used[segIdx]) continue
        used[segIdx] = 1
        const [p1, p2] = segs[segIdx]
        // end===0 means p1 is at the tail → next point is p2, and vice-versa
        pts.push(end === 0 ? p2 : p1)
        found = true
        break
      }
      if (!found) break
    }
  }

  // Grow pts backward from pts[0].
  function extendBackward(pts) {
    for (;;) {
      const head = pts[0]
      const neighbors = adj.get(snapKey(head[0], head[1]))
      if (!neighbors) break
      let found = false
      for (const { segIdx, end } of neighbors) {
        if (used[segIdx]) continue
        used[segIdx] = 1
        const [p1, p2] = segs[segIdx]
        // end===1 means p2 is at the head → prepend p1, and vice-versa
        pts.unshift(end === 1 ? p1 : p2)
        found = true
        break
      }
      if (!found) break
    }
  }

  const polylines = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const pts = [segs[i][0], segs[i][1]]
    extendForward(pts)
    extendBackward(pts)
    polylines.push(pts)
  }

  return polylines
}

/**
 * Reorder polylines with a greedy nearest-neighbour strategy to minimise
 * pen-up travel distance.  Each polyline can be traversed in either
 * direction; the algorithm picks whichever end is closest to the current
 * pen position and reverses the polyline if needed.
 */
export function sortPathsByTravel(polylines) {
  if (polylines.length === 0) return []

  const result = []
  const used = new Uint8Array(polylines.length)

  // Seed with the first polyline; subsequent choices are driven by proximity.
  used[0] = 1
  result.push(polylines[0])

  while (result.length < polylines.length) {
    const pen = result[result.length - 1].at(-1)
    let bestIdx = -1, bestDist = Infinity, bestReverse = false

    for (let i = 0; i < polylines.length; i++) {
      if (used[i]) continue
      const pts = polylines[i]
      const dFwd = dist2(pen, pts[0])
      const dRev = dist2(pen, pts[pts.length - 1])
      if (dFwd < bestDist) { bestDist = dFwd; bestIdx = i; bestReverse = false }
      if (dRev < bestDist) { bestDist = dRev; bestIdx = i; bestReverse = true }
    }

    used[bestIdx] = 1
    const pts = polylines[bestIdx]
    result.push(bestReverse ? [...pts].reverse() : pts)
  }

  return result
}

/**
 * Serialise a polyline (array of [x, y] points) to an SVG path d-string.
 */
export function polylinePath(pts) {
  const fmt = n => n.toFixed(4)
  const [first, ...rest] = pts
  return `M ${fmt(first[0])},${fmt(first[1])} ${rest.map(p => `L ${fmt(p[0])},${fmt(p[1])}`).join(' ')}`
}

/**
 * Full pipeline: join segments → sort by travel → return SVG d-strings.
 */
export function optimiseForPlotter(segs) {
  return sortPathsByTravel(joinSegments(segs)).map(polylinePath)
}
