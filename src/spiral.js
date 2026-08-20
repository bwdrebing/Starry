// Spiral Truchet arcs.
//
// A tile's arcs normally connect control point k on one edge of a vertex's
// wedge to point k on the other edge, so successive arcs close into concentric
// rings around that vertex.  With `spiral = ±1` point k is joined to point k±1
// instead: the radius ramps by exactly one lineSpacing across the arc's angular
// span, turning every ring into one turn of an Archimedean spiral.
//
// Continuity: every wedge is swept in the direction of increasing angle, so an
// arc that leaves a shared edge at radius (k+1)·spacing meets the neighbouring
// tile's arc that arrives there at the same radius.  The turns therefore chain
// through all tiles meeting at a vertex, forming one continuous spiral.
//
// Canvas has no spiral primitive, so spirals are stroked as polylines, and
// occlusion (which the ring code solves analytically in clipArcOutsideDisc) is
// resolved here by sampling with bisection refinement at each visibility flip.

const SAMPLE_PX = 2.5   // target spacing between polyline samples
const MIN_STEPS = 10
const MAX_STEPS = 72
const REFINE    = 12    // bisection iterations used to place a clip boundary

const TAU = 2 * Math.PI

// Ring indices whose arcs are drawn for a [r0, r1] range.
// Rings (spiral 0) draw one arc per index.  A spiral consumes two consecutive
// indices per arc, so one fewer arc is drawn and the radial envelope [r0, r1]
// is unchanged: +1 ramps k → k+1, −1 ramps k → k−1.
export function spiralArcStarts(r0, r1, spiral) {
  const lo = spiral < 0 ? r0 + 1 : r0
  const hi = spiral > 0 ? r1 - 1 : r1
  const out = []
  for (let k = lo; k <= hi; k++) out.push(k)
  return out
}

// Radius (in lineSpacing units) at parameter t ∈ [0,1] along an arc starting at k.
function arcRadius(k, spiral, t) { return k + spiral * t }

// Outer boundary of everything a vertex draws, at parameter t across its wedge.
// With rings this is the constant disc radius rMax the analytic clipper uses;
// with a spiral the boundary itself spirals, so occlusion follows it.
export function occluderRadius(rMax, spiral, t) {
  if (spiral > 0) return rMax - 1 + t
  if (spiral < 0) return rMax - t
  return rMax
}

// Is `p` outside every occluder's drawn region?
// An occluder is { center, a1, a2, rMax }: its wedge and outermost ring index.
// A convex tile lies wholly inside each of its vertices' wedges, so points fall
// in [a1, a2] in practice; anything outside is clamped to the nearer wedge end.
function isVisible(p, occluders, spiral, lineSpacing) {
  for (const o of occluders) {
    const dx = p[0] - o.center[0]
    const dy = p[1] - o.center[1]
    const d  = Math.hypot(dx, dy)
    const span = o.a2 - o.a1
    const off  = ((((Math.atan2(dy, dx) - o.a1) % TAU) + TAU) % TAU) / span
    const t    = off <= 1 ? off : (off < (1 + TAU / span) / 2 ? 1 : 0)
    if (d <= occluderRadius(o.rMax, spiral, t) * lineSpacing) return false
  }
  return true
}

// Split the spiral arc into its visible runs, each returned as a polyline
// [[x,y], ...].  With no occluders this is a single polyline for the whole arc.
export function spiralPolylines(center, a1, a2, k, spiral, lineSpacing, occluders = []) {
  const span = a2 - a1
  const rOut = Math.max(k, k + spiral) * lineSpacing
  const steps = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.ceil(span * rOut / SAMPLE_PX)))

  const pointAt = t => {
    const ang = a1 + span * t
    const r   = arcRadius(k, spiral, t) * lineSpacing
    return [center[0] + r * Math.cos(ang), center[1] + r * Math.sin(ang)]
  }

  const pts = []
  const vis = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = pointAt(t)
    pts.push(p)
    vis.push(occluders.length === 0 || isVisible(p, occluders, spiral, lineSpacing))
  }

  // Bisect between t0 (visible) and t1 (hidden) for the crossing point.
  const crossing = (tVis, tHid) => {
    let lo = tVis, hi = tHid
    for (let i = 0; i < REFINE; i++) {
      const mid = (lo + hi) / 2
      if (isVisible(pointAt(mid), occluders, spiral, lineSpacing)) lo = mid
      else hi = mid
    }
    return pointAt(lo)
  }

  const runs = []
  let run = null
  for (let i = 0; i <= steps; i++) {
    if (vis[i]) {
      if (!run) {
        run = []
        // Entering visibility mid-step: start the run at the exact boundary.
        if (i > 0) run.push(crossing(i / steps, (i - 1) / steps))
      }
      run.push(pts[i])
    } else if (run) {
      run.push(crossing((i - 1) / steps, i / steps))
      runs.push(run)
      run = null
    }
  }
  if (run) runs.push(run)
  return runs.filter(r => r.length >= 2)
}

export function strokeSpiralArc(ctx, center, a1, a2, k, spiral, lineSpacing, occluders = []) {
  for (const line of spiralPolylines(center, a1, a2, k, spiral, lineSpacing, occluders)) {
    ctx.beginPath()
    ctx.moveTo(line[0][0], line[0][1])
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1])
    ctx.stroke()
  }
}

export function spiralArcPaths(center, a1, a2, k, spiral, lineSpacing, occluders = []) {
  const f = n => n.toFixed(4)
  return spiralPolylines(center, a1, a2, k, spiral, lineSpacing, occluders).map(line =>
    `M${f(line[0][0])},${f(line[0][1])} ` +
    line.slice(1).map(p => `L${f(p[0])},${f(p[1])}`).join(' '))
}
