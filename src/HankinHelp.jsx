import { useState, useEffect, useRef } from 'react'
import { makeEdgeRays, rayIntersect, pointInPolygon, ensureClockwise, getHankinSegments } from './hankin'

// Colours matched to the main canvas: white motif lines, gold accents.
const LINE    = 'rgba(255,255,255,0.85)'
const FAINT   = 'rgba(255,255,255,0.30)'
const OUTLINE = 'rgba(255,255,255,0.13)'
const GOLD    = 'rgba(255,210,60,0.9)'
const GOLD_DIM = 'rgba(255,210,60,0.55)'
const LABEL   = 'rgba(255,255,255,0.40)'

// A canvas that re-runs `draw(ctx, w, h)` whenever the draw closure changes
// (i.e. whenever the owning demo's state changes) or the element resizes.
function DemoCanvas({ draw, height, testId }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth || 1
      canvas.width = w * dpr
      canvas.height = height * dpr
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, height)
      draw(ctx, w, height)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw, height])

  return <canvas ref={ref} className="help-demo" style={{ height: `${height}px` }} data-testid={testId} />
}

function strokeSeg(ctx, [x1, y1], [x2, y2]) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}

function dot(ctx, [x, y], r, color) {
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

function strokePoly(ctx, verts) {
  ctx.beginPath()
  ctx.moveTo(verts[0][0], verts[0][1])
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1])
  ctx.closePath()
  ctx.stroke()
}

function regularPolygon(cx, cy, r, n, startAngle = -Math.PI / 2) {
  return Array.from({ length: n }, (_, k) => {
    const a = startAngle + (k * 2 * Math.PI) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
}

/* ── Section 1: two rays from every edge ─────────────────────────────────── */

function EdgeRaysDemo() {
  const [thetaDeg, setThetaDeg] = useState(55)
  const [delta, setDelta] = useState(0)

  const draw = (ctx, w, h) => {
    const theta = (thetaDeg * Math.PI) / 180
    const y = h * 0.66
    const ax = w * 0.13, bx = w * 0.87
    const mid = [(ax + bx) / 2, y]
    const offset = (delta * (bx - ax)) / 2
    const oL = [mid[0] - offset, y]
    const oR = [mid[0] + offset, y]
    // ray directions from the inward (upward) normal, tilted ±θ — same
    // construction as makeEdgeRays for a horizontal edge with inside above
    const sin = Math.sin(theta), cos = Math.cos(theta)
    const dirL = [sin, -cos]   // left ray leans right, into the tile
    const dirR = [-sin, -cos]  // right ray leans left

    // Tint the tile interior above the edge
    const grad = ctx.createLinearGradient(0, y, 0, 0)
    grad.addColorStop(0, 'rgba(150,130,255,0.10)')
    grad.addColorStop(1, 'rgba(150,130,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(ax, 0, bx - ax, y)

    ctx.font = '11px Georgia, serif'
    ctx.fillStyle = LABEL
    ctx.fillText('this tile', ax + 8, 17)
    ctx.fillText('neighbouring tile', ax + 8, h - 9)

    // The edge and its two endpoints (tile vertices)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    strokeSeg(ctx, [ax, y], [bx, y])
    dot(ctx, [ax, y], 3, 'rgba(255,255,255,0.55)')
    dot(ctx, [bx, y], 3, 'rgba(255,255,255,0.55)')

    // Dashed perpendicular at the edge midpoint — the reference for θ
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    strokeSeg(ctx, mid, [mid[0], y - h * 0.5])

    // The neighbouring tile applies the same rule on its side (mirrored, faint)
    const L = h * 1.6
    strokeSeg(ctx, oL, [oL[0] + sin * L, oL[1] + cos * L])
    strokeSeg(ctx, oR, [oR[0] - sin * L, oR[1] + cos * L])
    ctx.setLineDash([])

    // The two rays into this tile
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1.75
    strokeSeg(ctx, oL, [oL[0] + dirL[0] * L, oL[1] + dirL[1] * L])
    strokeSeg(ctx, oR, [oR[0] + dirR[0] * L, oR[1] + dirR[1] * L])

    // θ arc between the perpendicular and the right ray
    ctx.strokeStyle = GOLD_DIM
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.arc(oR[0], oR[1], 26, -Math.PI / 2, -Math.PI / 2 - theta, true)
    ctx.stroke()
    const midAng = -Math.PI / 2 - theta / 2
    ctx.fillStyle = GOLD
    ctx.font = 'italic 13px Georgia, serif'
    ctx.fillText('θ', oR[0] + 37 * Math.cos(midAng) - 3, oR[1] + 37 * Math.sin(midAng) + 4)

    // Contact points the rays grow from
    dot(ctx, oL, 3.5, GOLD)
    dot(ctx, oR, 3.5, GOLD)
  }

  return (
    <>
      <DemoCanvas draw={draw} height={210} testId="help-demo-rays" />
      <div className="help-controls">
        <div className="prop-row">
          <span className="prop-label">Angle</span>
          <div className="prop-control">
            <input id="help-rays-angle" type="range" min={10} max={80} step={1}
              value={thetaDeg} onChange={e => setThetaDeg(Number(e.target.value))} />
          </div>
          <span className="prop-value">{thetaDeg}°</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Inset</span>
          <div className="prop-control">
            <input id="help-rays-inset" type="range" min={0} max={0.9} step={0.01}
              value={delta} onChange={e => setDelta(Number(e.target.value))} />
          </div>
          <span className="prop-value">{delta.toFixed(2)}</span>
        </div>
      </div>
    </>
  )
}

/* ── Section 2: rays stop where they meet ────────────────────────────────── */

function StarPointsDemo() {
  const [thetaDeg, setThetaDeg] = useState(60)
  const [sides, setSides] = useState(6)
  const [skip, setSkip] = useState(0)

  const draw = (ctx, w, h) => {
    const theta = (thetaDeg * Math.PI) / 180
    const verts = ensureClockwise(regularPolygon(w / 2, h / 2, Math.min(w, h) * 0.42, sides))
    const n = sides
    const effSkip = n >= 6 ? skip : 0
    const [edges] = makeEdgeRays(verts, () => theta, 0, false)

    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1
    strokePoly(ctx, verts)

    for (let i = 0; i < n; i++) {
      const j = (i + 1 + effSkip) % n
      const rayA = edges[i].left, rayB = edges[j].right
      const pt = rayIntersect(rayA.origin, rayA.dir, rayB.origin, rayB.dir)?.[2]
      const inside = pt && pointInPolygon(pt, verts)
      const end = inside
        ? pt
        : [(rayA.origin[0] + rayB.origin[0]) / 2, (rayA.origin[1] + rayB.origin[1]) / 2]

      // Dashed hint of where each ray would have kept going
      if (inside) {
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 1
        ctx.setLineDash([3, 4])
        const cont = 22
        strokeSeg(ctx, end, [end[0] + rayA.dir[0] * cont, end[1] + rayA.dir[1] * cont])
        strokeSeg(ctx, end, [end[0] + rayB.dir[0] * cont, end[1] + rayB.dir[1] * cont])
        ctx.setLineDash([])
      }

      ctx.strokeStyle = LINE
      ctx.lineWidth = 1.5
      strokeSeg(ctx, rayA.origin, end)
      strokeSeg(ctx, rayB.origin, end)

      dot(ctx, rayA.origin, 2.5, 'rgba(255,255,255,0.55)')
      dot(ctx, rayB.origin, 2.5, 'rgba(255,255,255,0.55)')
      dot(ctx, end, 3.5, GOLD)
    }
  }

  return (
    <>
      <DemoCanvas draw={draw} height={250} testId="help-demo-stars" />
      <div className="help-controls">
        <div className="prop-row">
          <span className="prop-label">Shape</span>
          <div className="prop-control">
            <div className="seg-ctrl">
              {[4, 6, 8, 12].map(v => (
                <button key={v} className={sides === v ? 'active' : ''}
                  onClick={() => setSides(v)}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="prop-row">
          <span className="prop-label">Angle</span>
          <div className="prop-control">
            <input id="help-stars-angle" type="range" min={10} max={80} step={1}
              value={thetaDeg} onChange={e => setThetaDeg(Number(e.target.value))} />
          </div>
          <span className="prop-value">{thetaDeg}°</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Density</span>
          <div className="prop-control">
            <div className="seg-ctrl">
              {[0, 1, 2, 3].map(v => (
                <button key={v} className={skip === v ? 'active' : ''}
                  disabled={sides < 6}
                  onClick={() => setSkip(v)}>{v}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Section 3: thick bands that weave ───────────────────────────────────── */

function WeaveDemo() {
  const [thetaDeg, setThetaDeg] = useState(55)
  const [bandWidth, setBandWidth] = useState(0.2)
  const [weave, setWeave] = useState(true)

  const draw = (ctx, w, h) => {
    const theta = (thetaDeg * Math.PI) / 180
    const R = h * 0.17
    const cx = w / 2, cy = h / 2
    // Central hexagon plus its six neighbours, sharing edges
    const centers = [[cx, cy]]
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3
      centers.push([cx + Math.sqrt(3) * R * Math.cos(a), cy + Math.sqrt(3) * R * Math.sin(a)])
    }
    const shapes = centers.map(([x, y]) => [regularPolygon(x, y, R, 6, 0)])

    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1
    for (const shape of shapes) strokePoly(ctx, shape[0])

    const { underSegs, overSegs } = getHankinSegments(
      shapes, theta, 0, true, weave, weave ? 0.08 : 0, bandWidth)

    ctx.strokeStyle = LINE
    ctx.lineWidth = 1.5
    for (const [p1, p2] of underSegs) strokeSeg(ctx, p1, p2)
    for (const [p1, p2] of overSegs) strokeSeg(ctx, p1, p2)
  }

  return (
    <>
      <DemoCanvas draw={draw} height={260} testId="help-demo-weave" />
      <div className="help-controls">
        <div className="prop-row">
          <span className="prop-label">Weave</span>
          <div className="prop-control">
            <button
              className={`toggle-switch${weave ? ' on' : ''}`}
              onClick={() => setWeave(v => !v)}
              aria-label="Toggle weave"
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>
        <div className="prop-row">
          <span className="prop-label">Width</span>
          <div className="prop-control">
            <input id="help-weave-width" type="range" min={0.05} max={0.4} step={0.01}
              value={bandWidth} onChange={e => setBandWidth(Number(e.target.value))} />
          </div>
          <span className="prop-value">{bandWidth.toFixed(2)}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Angle</span>
          <div className="prop-control">
            <input id="help-weave-angle" type="range" min={10} max={80} step={1}
              value={thetaDeg} onChange={e => setThetaDeg(Number(e.target.value))} />
          </div>
          <span className="prop-value">{thetaDeg}°</span>
        </div>
      </div>
    </>
  )
}

/* ── Overlay ─────────────────────────────────────────────────────────────── */

export default function HankinHelp({ onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={e => e.stopPropagation()}>
        <div className="help-header">
          <span className="help-title">How Hankin Motifs Work</span>
          <button className="gallery-close help-close" onClick={onClose} aria-label="Close help">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        <div className="help-scroll">
          <p className="help-text">
            Every pattern here starts from a <em>tiling</em> — polygons that cover the
            plane with no gaps. The star pattern laid on top is built with a method the
            engineer E.&nbsp;H.&nbsp;Hankin observed in medieval Islamic architecture,
            sometimes called <em>polygons in contact</em>. The tiling itself is only
            scaffolding: lines grow out of every tile edge by one simple rule, and the
            stars emerge on their own.
          </p>

          <div className="help-section">
            <h3>1 · Two rays from every edge</h3>
            <p className="help-text">
              Pick any edge of any tile. From a point on that edge, two rays shoot into
              the tile — one leaning left, one leaning right — each making the same
              angle <em>θ</em> with the edge&rsquo;s perpendicular (dashed). The tile on
              the other side of the edge applies the same rule (shown faint below), so
              the lines continue straight across tile boundaries. The <em>inset</em>{' '}
              slides the two starting points apart from the midpoint, opening the
              crossing into a gap.
            </p>
            <EdgeRaysDemo />
          </div>

          <div className="help-section">
            <h3>2 · Rays stop where they meet</h3>
            <p className="help-text">
              Inside a tile, every edge fires its pair of rays. Each ray travels until
              it meets its partner — the matching ray from the next edge around the
              polygon — and both stop there. Those meeting points (gold) become the
              tips of a star. The dashed stubs show where the rays would have kept
              going. <em>Density</em> pairs each ray with an edge further around the
              polygon instead (skipping 1, 2 or 3 edges), so rays travel deeper before
              meeting and the star grows sharper. It only applies to shapes with at
              least six sides — squares and triangles are too small to skip across.
            </p>
            <StarPointsDemo />
          </div>

          <div className="help-section">
            <h3>3 · Thick bands that weave</h3>
            <p className="help-text">
              To get the look of interlaced straps, each line is widened into a ribbon:
              two parallel lines drawn either side of where the original ray ran. Where
              two ribbons cross, they alternate like threads in cloth — a ribbon passes
              <em> over</em> at one crossing, <em>under</em> at the next. Passing under
              simply means a gap is cut in the ribbon&rsquo;s outlines where the other
              ribbon covers it. Turn the weave off to see the ribbons cross flat, and
              watch how each crossing changes as the bands get wider.
            </p>
            <WeaveDemo />
          </div>
        </div>
      </div>
    </div>
  )
}
