import { useState, useEffect, useRef } from 'react'
import { getHankinSegments } from './hankin.js'

// ─── Local geometry helpers ───────────────────────────────────────────────────
function rot([x, y], a) {
  const c = Math.cos(a), s = Math.sin(a)
  return [x * c - y * s, x * s + y * c]
}
function nor([x, y]) { const l = Math.sqrt(x * x + y * y); return l ? [x / l, y / l] : [0, 0] }
function sub([ax, ay], [bx, by]) { return [ax - bx, ay - by] }
function add([ax, ay], [bx, by]) { return [ax + bx, ay + by] }
function scl([x, y], s) { return [x * s, y * s] }
function dot([ax, ay], [bx, by]) { return ax * bx + ay * by }

function isect(o1, d1, o2, d2) {
  const cr = (a, b) => a[0] * b[1] - a[1] * b[0]
  const denom = cr(d1, d2)
  if (Math.abs(denom) < 1e-10) return null
  const df = sub(o2, o1)
  const t = cr(df, d2) / denom, s = cr(df, d1) / denom
  if (t < 1e-6 || s < 1e-6) return null
  return add(o1, scl(d1, t))
}

function buildEdges(verts, theta, delta) {
  const n = verts.length
  const c = verts.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]).map(v => v / n)
  return Array.from({ length: n }, (_, i) => {
    const a = verts[i], b = verts[(i + 1) % n]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const ed = nor(sub(b, a))
    const el = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    let nm = rot(ed, Math.PI / 2)
    if (dot(nm, sub(c, mid)) < 0) nm = scl(nm, -1)
    const off = delta * el * 0.5
    return {
      oL: sub(mid, scl(ed, off)),
      oR: add(mid, scl(ed, off)),
      lDir: rot(nm, +theta),
      rDir: rot(nm, -theta),
    }
  })
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function initCtx(canvas) {
  const ratio = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const w = rect.width, h = rect.height
  if (!w || !h) return null
  canvas.width = w * ratio; canvas.height = h * ratio
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

function arrowHead(ctx, x1, y1, x2, y2, hl = 8) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - hl * Math.cos(a - 0.4), y2 - hl * Math.sin(a - 0.4))
  ctx.lineTo(x2 - hl * Math.cos(a + 0.4), y2 - hl * Math.sin(a + 0.4))
  ctx.closePath(); ctx.fill()
}

function starDot(ctx, x, y) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 13)
  g.addColorStop(0, 'rgba(255,245,80,0.75)')
  g.addColorStop(1, 'rgba(255,245,80,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffe040'
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
}

// ─── Section 1: What is θ ─────────────────────────────────────────────────────
function drawS1(canvas, theta) {
  const r = initCtx(canvas); if (!r) return
  const { ctx, w, h } = r
  const cx = w / 2, cy = h * 0.63
  const eH = w * 0.27
  const rLen = Math.min(h * 0.48, w * 0.3)
  const nLen = h * 0.29

  // Edge
  ctx.strokeStyle = 'rgba(150,150,240,0.65)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx - eH, cy); ctx.lineTo(cx + eH, cy); ctx.stroke()
  ;[cx - eH, cx + eH].forEach(x => {
    ctx.fillStyle = 'rgba(150,150,240,0.5)'; ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill()
  })

  // Midpoint tick
  ctx.strokeStyle = 'rgba(150,150,240,0.28)'; ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke()
  ctx.setLineDash([])

  // Normal arrow
  ctx.strokeStyle = 'rgba(255,210,50,0.8)'; ctx.fillStyle = 'rgba(255,210,50,0.8)'; ctx.lineWidth = 1.8
  arrowHead(ctx, cx, cy, cx, cy - nLen)
  ctx.fillStyle = 'rgba(255,210,50,0.5)'; ctx.font = '10px Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText('normal', cx, cy - nLen - 7)

  // Two rays from midpoint at ±θ from normal
  // normal = (0,−1) in canvas coords; rotate by ±theta
  const lE = [cx + rLen * Math.sin(theta), cy - rLen * Math.cos(theta)]
  const rE = [cx - rLen * Math.sin(theta), cy - rLen * Math.cos(theta)]
  ctx.strokeStyle = 'rgba(70,190,255,0.9)'; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lE[0], lE[1]); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rE[0], rE[1]); ctx.stroke()

  // Angle arcs
  const aR = 30
  ctx.strokeStyle = 'rgba(180,180,255,0.5)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, aR, -Math.PI / 2, -Math.PI / 2 + theta, false); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, aR, -Math.PI / 2 - theta, -Math.PI / 2, false); ctx.stroke()

  // θ labels
  ctx.fillStyle = 'rgba(200,200,255,0.9)'; ctx.font = 'italic 13px Georgia, serif'; ctx.textAlign = 'center'
  const lR = aR + 14
  ctx.fillText('θ', cx + lR * Math.cos(-Math.PI / 2 + theta / 2), cy + lR * Math.sin(-Math.PI / 2 + theta / 2))
  ctx.fillText('θ', cx + lR * Math.cos(-Math.PI / 2 - theta / 2), cy + lR * Math.sin(-Math.PI / 2 - theta / 2))
}

// ─── Section 2: Rays from a single edge ───────────────────────────────────────
function drawS2(canvas, theta) {
  const r = initCtx(canvas); if (!r) return
  const { ctx, w, h } = r
  const cx = w / 2, cy = h * 0.65
  const eH = w * 0.27
  const DELTA = 0.35
  const el = eH * 2
  const off = DELTA * el * 0.5
  const rLen = Math.min(h * 0.58, w * 0.38)

  const oL = [cx - off, cy], oR = [cx + off, cy]
  // normal pointing up (0, -1); rays at ±theta from normal
  const lDir = [Math.sin(theta), -Math.cos(theta)]
  const rDir = [-Math.sin(theta), -Math.cos(theta)]

  // Edge
  ctx.strokeStyle = 'rgba(150,150,240,0.65)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx - eH, cy); ctx.lineTo(cx + eH, cy); ctx.stroke()
  ;[cx - eH, cx + eH].forEach(x => {
    ctx.fillStyle = 'rgba(150,150,240,0.5)'; ctx.beginPath(); ctx.arc(x, cy, 3, 0, Math.PI * 2); ctx.fill()
  })

  // Intersection point
  const pt = isect(oL, lDir, oR, rDir)
  const ok = pt && pt[1] > 2 && pt[1] < h - 2 && pt[0] > 2 && pt[0] < w - 2

  const lEnd = ok ? pt : add(oL, scl(lDir, rLen))
  const rEnd = ok ? pt : add(oR, scl(rDir, rLen))

  // Left ray (from oL, blue)
  ctx.strokeStyle = 'rgba(70,200,255,0.85)'; ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(oL[0], oL[1]); ctx.lineTo(lEnd[0], lEnd[1]); ctx.stroke()
  // Right ray (from oR, coral)
  ctx.strokeStyle = 'rgba(255,120,90,0.85)'
  ctx.beginPath(); ctx.moveTo(oR[0], oR[1]); ctx.lineTo(rEnd[0], rEnd[1]); ctx.stroke()

  // Origin dots
  ctx.font = '11px Georgia, serif'; ctx.textAlign = 'center'
  ;[[oL, 'rgba(70,200,255,0.9)', 'oL'], [oR, 'rgba(255,120,90,0.9)', 'oR']].forEach(([o, col, lbl]) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(o[0], o[1], 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = col.replace(/[\d.]+\)$/, '0.55)'); ctx.fillText(lbl, o[0], o[1] + 16)
  })

  // Star point
  if (ok) {
    starDot(ctx, pt[0], pt[1])
    ctx.fillStyle = 'rgba(255,235,60,0.65)'; ctx.font = '10px Georgia, serif'; ctx.textAlign = 'left'
    ctx.fillText('star point', pt[0] + 10, pt[1] + 4)
  }
}

// ─── Section 3: Single polygon ────────────────────────────────────────────────
function drawS3(canvas, theta) {
  const r = initCtx(canvas); if (!r) return
  const { ctx, w, h } = r
  const cx = w / 2, cy = h / 2
  const R = Math.min(w, h) * 0.34
  const n = 6

  // Pointy-top hexagon
  const verts = Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI * 2) / n - Math.PI / 2
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)]
  })

  // Faint hexagon outline
  ctx.strokeStyle = 'rgba(150,150,240,0.22)'; ctx.lineWidth = 1.5
  ctx.beginPath(); verts.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath(); ctx.stroke()

  const edges = buildEdges(verts, theta, 0.15)

  // Star points: left ray of edge i meets right ray of edge (i+1)%n
  const spts = Array.from({ length: n }, (_, i) => {
    const j = (i + 1) % n
    return isect(edges[i].oL, edges[i].lDir, edges[j].oR, edges[j].rDir)
  })

  // Draw rays: edge i's left ray → spts[i], edge i's right ray → spts[(i-1+n)%n]
  ctx.lineWidth = 2; ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const ptL = spts[i]
    const ptR = spts[(i - 1 + n) % n]

    if (ptL) {
      ctx.strokeStyle = 'rgba(70,200,255,0.75)'
      ctx.beginPath(); ctx.moveTo(edges[i].oL[0], edges[i].oL[1]); ctx.lineTo(ptL[0], ptL[1]); ctx.stroke()
    }
    if (ptR) {
      ctx.strokeStyle = 'rgba(255,120,90,0.75)'
      ctx.beginPath(); ctx.moveTo(edges[i].oR[0], edges[i].oR[1]); ctx.lineTo(ptR[0], ptR[1]); ctx.stroke()
    }
  }

  // Star point dots
  for (const pt of spts) { if (pt) starDot(ctx, pt[0], pt[1]) }
}

// ─── Section 4: Multiple polygons ─────────────────────────────────────────────
function drawS4(canvas, theta) {
  const r = initCtx(canvas); if (!r) return
  const { ctx, w, h } = r
  const SQ = Math.min(w / 3.6, h / 3.6)
  const cols = 3, rows = 3
  const sx = (w - cols * SQ) / 2, sy = (h - rows * SQ) / 2

  // Build shapes in [[vertices]] format for getHankinSegments
  const shapes = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = sx + col * SQ, y0 = sy + row * SQ
      shapes.push([[[x0, y0], [x0 + SQ, y0], [x0 + SQ, y0 + SQ], [x0, y0 + SQ]]])
    }
  }

  // Faint polygon outlines
  ctx.strokeStyle = 'rgba(150,150,240,0.18)'; ctx.lineWidth = 1
  for (const [v] of shapes) {
    ctx.beginPath(); v.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke()
  }

  // Hankin motif using the real algorithm
  const { underSegs, overSegs } = getHankinSegments(shapes, theta, 0.2)
  ctx.strokeStyle = 'rgba(170,215,255,0.88)'; ctx.lineWidth = 2; ctx.lineCap = 'round'
  for (const [p1, p2] of [...underSegs, ...overSegs]) {
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke()
  }
}

// ─── Overlay component ────────────────────────────────────────────────────────
export default function MotifHelpOverlay({ onClose }) {
  const [thetaDeg, setThetaDeg] = useState(45)
  const theta = thetaDeg * Math.PI / 180

  const c1 = useRef(null), c2 = useRef(null), c3 = useRef(null), c4 = useRef(null)

  useEffect(() => {
    if (c1.current) drawS1(c1.current, theta)
    if (c2.current) drawS2(c2.current, theta)
    if (c3.current) drawS3(c3.current, theta)
    if (c4.current) drawS4(c4.current, theta)
  }, [theta])

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="help-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="help-modal">

        <div className="help-header">
          <h2>How Hankin Motifs Work</h2>
          <button className="help-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="help-theta-row">
          <label htmlFor="help-theta">Angle</label>
          <input
            id="help-theta"
            type="range" min={10} max={80} step={1}
            value={thetaDeg}
            onChange={e => setThetaDeg(Number(e.target.value))}
          />
          <span className="slider-value">{thetaDeg}°</span>
        </div>

        <div className="help-body">

          <div className="help-section">
            <h3 className="help-section-title">1 — What is θ (Theta)?</h3>
            <div className="help-canvas-wrap">
              <canvas ref={c1} style={{ display: 'block', width: '100%', height: '152px' }} />
            </div>
            <p className="help-desc">
              Each polygon edge has an inward-facing <em>normal</em> — a perpendicular arrow pointing into the polygon's interior. θ (theta) is how far each ray deviates from that normal. A small θ produces nearly perpendicular rays that converge tightly; a larger θ fans them outward. Drag the slider above to see the effect.
            </p>
          </div>

          <div className="help-section">
            <h3 className="help-section-title">2 — Rays from a Single Edge</h3>
            <div className="help-canvas-wrap">
              <canvas ref={c2} style={{ display: 'block', width: '100%', height: '172px' }} />
            </div>
            <p className="help-desc">
              The two rays don't originate from the same point. Instead, the <span style={{ color: 'rgba(70,200,255,0.85)' }}>left ray</span> starts from <em>oL</em> (offset toward the left vertex) and the <span style={{ color: 'rgba(255,120,90,0.85)' }}>right ray</span> from <em>oR</em> (offset toward the right vertex). Where they converge is the <strong>star point</strong> — the tip of the interlace strapwork.
            </p>
          </div>

          <div className="help-section">
            <h3 className="help-section-title">3 — A Single Polygon</h3>
            <div className="help-canvas-wrap">
              <canvas ref={c3} style={{ display: 'block', width: '100%', height: '192px' }} />
            </div>
            <p className="help-desc">
              A regular hexagon has six edges, each contributing a <span style={{ color: 'rgba(70,200,255,0.85)' }}>left ray</span> and a <span style={{ color: 'rgba(255,120,90,0.85)' }}>right ray</span>. Adjacent edges share a star point: the left ray of edge <em>i</em> meets the right ray of edge <em>i+1</em>. Together the twelve rays form a six-pointed star motif inside the polygon.
            </p>
          </div>

          <div className="help-section">
            <h3 className="help-section-title">4 — Multiple Polygons</h3>
            <div className="help-canvas-wrap">
              <canvas ref={c4} style={{ display: 'block', width: '100%', height: '210px' }} />
            </div>
            <p className="help-desc">
              When polygons tile the plane, each shared edge is processed identically by both neighbouring tiles. Because rays from both sides of a boundary use the same edge midpoint, they align exactly — and the straps flow continuously across the whole pattern, creating the interlace seen in Islamic geometric art.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
