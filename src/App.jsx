import { useState, useRef, useEffect } from 'react'
import StarryCanvas from './StarryCanvas'
import AntwerpCanvas from './AntwerpCanvas'
import TilingGallery from './TilingGallery'
import { VERTEX_COLORS } from './truchet'
import { SQUARE_VERTEX_COLORS } from './squareTruchet'
import './App.css'

const TILINGS = [
  // ── 1-Uniform (Archimedean) ──────────────────────────────────────────────
  { label: '1-Uniform: 3⁶ — Triangular',                config: '3/m30/r(h2)' },
  { label: '1-Uniform: 4⁴ — Square',                     config: '4/m45/r(h1)' },
  { label: '1-Uniform: 6³ — Hexagonal',                  config: '6/m30/r(h1)' },
  { label: '1-Uniform: (3.6)² — Trihexagonal',           config: '6-3-6/m30/r(v4)' },
  { label: '1-Uniform: 3.4.6.4 — Rhombitrihexagonal',    config: '6-4-3/m30/r(c2)' },
  { label: '1-Uniform: 4.6.12 — Truncated Trihexagonal', config: '12-6,4/m30/r(c2)' },
  { label: '1-Uniform: 3.12² — Truncated Hexagonal',     config: '12-3/m30/r(h3)' },
  { label: '1-Uniform: 4.8² — Truncated Square',         config: '8-4/m90/r(h4)' },
  { label: '1-Uniform: 3³.4² — Elongated Triangular',    config: '4-3/m90/r(h2)' },
  { label: '1-Uniform: 3⁴.6 — Snub Hexagonal',           config: '6-3-3/r60/r(h5)' },
  // ── 2-Uniform ────────────────────────────────────────────────────────────
  { label: '2-Uniform: 3⁶; 3².4.3.4',                   config: '3-4-3/m30/r(c3)' },
  { label: '2-Uniform: 3.4.6.4; 3².4.3.4',               config: '6-4-3,3/m30/r(h1)' },
  { label: '2-Uniform: 3⁶; 3².6²',                       config: '3-6/m30/r(c2)' },
  { label: '2-Uniform: [3⁶; 3⁴.6]¹',                    config: '6-3,3-3/m30/r(h1)' },
  { label: '2-Uniform: [3⁶; 3⁴.6]²',                    config: '6-3-3,3-3/r60/r(h8)' },
  { label: '2-Uniform: 3².6²; 3⁴.6',                     config: '6-3/m90/r(h1)' },
  { label: '2-Uniform: 3.6.3.6; 3².6²',                  config: '6-3,6/m90/r(h3)' },
  { label: '2-Uniform: [3.4².6; 3.6.3.6]²',              config: '6-3,4/m90/r(h4)' },
  { label: '2-Uniform: [3³.4²; 3².4.3.4]¹',              config: '4-3,3-4,3/r90/m(h3)' },
  { label: '2-Uniform: [4⁴; 3³.4²]¹',                    config: '4-3/m(h4)/m(h3)/r(h2)' },
  { label: '2-Uniform: [4⁴; 3³.4²]²',                    config: '4-4-3-3/m90/r(h3)' },
  { label: '2-Uniform: [3⁶; 3³.4²]¹',                    config: '4-3,4-3,3/m90/r(h3)' },
  { label: '2-Uniform: [3⁶; 3³.4²]²',                    config: '4-3-3-3/m90/r(h7)/r(h5)' },
  // ── 3-Uniform (2 vertex types) ───────────────────────────────────────────
  { label: '3-Uniform: [(3⁶)²; 3⁴.6]¹',                 config: '6-3-3/m30/r(v3)' },
  { label: '3-Uniform: 3⁶; (3².4.3.4)²',                 config: '3-4-3,3/m30/m(h2)' },
  { label: '3-Uniform: [3³.4²; (4⁴)²]¹',                 config: '4-4-4-3/m90/r(h4)' },
  { label: '3-Uniform: [(3³.4²)²; 4⁴]¹',                 config: '4-4-3-3-4/m90/r(h10)/r(c3)' },
  { label: '3-Uniform: [(3⁶)²; 3³.4²]²',                 config: '4-3-3-3-3/m90/r(h2)/m(h22)' },
  { label: '3-Uniform: (3.4.6.4)²; 3.4².6',              config: '6-4-3,4-6,3/m30/r(c2)' },
  // ── 3-Uniform (3 vertex types) ───────────────────────────────────────────
  { label: '3-Uniform: 3.4².6; 3.6.3.6; 4.6.12',         config: '12-6,4-3,3,4/m30/r(c5)' },
  { label: '3-Uniform: 3⁶; 3².4.12; 4.6.12',             config: '12-3,4,6-3/m60/m(c5)' },
  { label: '3-Uniform: 3⁶; 3².4.3.4; 3.4².6',            config: '3-4-3,4-6/m30/r(c5)' },
  { label: '3-Uniform: 3⁶; 3³.4²; 3².4.3.4',             config: '3-4-3-3/m30/r(h6)' },
  { label: '3-Uniform: 3⁶; 3³.4²; 3.4.6.4',              config: '6-4-3,4-3,3/m30/r(c5)' },
  { label: '3-Uniform: [3⁶; 3³.4²; 4⁴]²',                config: '4-4-3-3-3/m90/r(h9)/r(h3)' },
  { label: '3-Uniform: [3⁶; 3⁴.6; 3².6²]³',              config: '6-3-3/m90/r(h2)' },
  { label: '3-Uniform: [3⁶; 3⁴.6; 3.6.3.6]³',            config: '3-3-6/r60/r(v4)' },
  { label: '3-Uniform: [3².6²; 3.6.3.6; 6³]¹',           config: '6-6-3,3,3/r60/r(h2)' },
  // ── Quasi-periodic ───────────────────────────────────────────────────────
  { label: 'Quasi-periodic: 5-fold (Penrose P3)',          config: 'penrose' },
  { label: 'Quasi-periodic: 7-fold',                       config: 'penrose7' },
  { label: 'Quasi-periodic: 8-fold (Ammann-Beenker)',      config: 'penrose8' },
  // ── Truchet ─────────────────────────────────────────────────────────────────
  { label: 'Truchet: Triangular',                          config: 'truchet' },
  { label: 'Truchet: Square',                              config: 'squareTruchet' },
]

export default function App() {
  const canvasRef = useRef(null)
  const [tilingIndex, setTilingIndex] = useState(0)
  const [showMotif, setShowMotif] = useState(true)
  const [thetaDeg, setThetaDeg] = useState(45)
  const [parquetDirection, setParquetDirection] = useState('none')
  const [parquetFunction, setParquetFunction] = useState('wave-ltr')
  const [animSpeed, setAnimSpeed] = useState(1)
  const [thetaMinDeg, setThetaMinDeg] = useState(30)
  const [thetaMaxDeg, setThetaMaxDeg] = useState(60)
  const [linearAngle, setLinearAngle] = useState(0)          // radians
  const [parquetCenterX, setParquetCenterX] = useState(0)   // world coords
  const [parquetCenterY, setParquetCenterY] = useState(0)
  const [ellipseAngle, setEllipseAngle] = useState(0)         // radians
  const [ellipseMajorScale, setEllipseMajorScale] = useState(1.0)
  const [ellipseMinorScale, setEllipseMinorScale] = useState(1.0)
  const [parquetEffect, setParquetEffect] = useState('none')
  const [effectStrength, setEffectStrength] = useState(0.5)
  const [effectRadius, setEffectRadius] = useState(0.4)
  const [radius, setRadius] = useState(1)
  const [delta, setDelta] = useState(0)
  const [debug, setDebug] = useState(false)
  const [thick, setThick] = useState(false)
  const [bandWidth, setBandWidth] = useState(0.2)
  const [shelfCollapsed, setShelfCollapsed] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [selectedTileIdx, setSelectedTileIdx]   = useState(-1)
  const [selectedTileMeta, setSelectedTileMeta] = useState(null)

  const isTruchet       = TILINGS[tilingIndex].config === 'truchet'
  const isSquareTruchet = TILINGS[tilingIndex].config === 'squareTruchet'
  const isAnyTruchet    = isTruchet || isSquareTruchet

  function updateTileMeta(updates) {
    if (selectedTileIdx < 0) return
    canvasRef.current?.updateTileMeta(selectedTileIdx, updates)
    setSelectedTileMeta(prev => ({ ...prev, ...updates }))
  }

  useEffect(() => {
    if (!isTruchet) return
    function handleKeyDown(e) {
      if (selectedTileIdx < 0 || !selectedTileMeta) return

      // Rotate right (W)
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        const newStartPt = (selectedTileMeta.startPt + 1) % 3
        canvasRef.current?.updateTileMeta(selectedTileIdx, { startPt: newStartPt })
        setSelectedTileMeta(prev => ({ ...prev, startPt: newStartPt }))
        return
      }
      // Rotate left (Q)
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        const newStartPt = (selectedTileMeta.startPt + 2) % 3
        canvasRef.current?.updateTileMeta(selectedTileIdx, { startPt: newStartPt })
        setSelectedTileMeta(prev => ({ ...prev, startPt: newStartPt }))
        return
      }
      // Backspace — suppress all arcs on the selected tile
      if (e.key === 'Backspace') {
        e.preventDefault()
        const updates = { suppressA: true, suppressB: true, suppressC: true }
        canvasRef.current?.updateTileMeta(selectedTileIdx, updates)
        setSelectedTileMeta(prev => ({ ...prev, ...updates }))
        return
      }
      // A/S/D — toggle arcs A, B, C individually
      const ARC_TOGGLE = { a: 'suppressA', s: 'suppressB', d: 'suppressC' }
      const arcKey = ARC_TOGGLE[e.key.toLowerCase()]
      if (arcKey) {
        e.preventDefault()
        const newVal = !selectedTileMeta[arcKey]
        canvasRef.current?.updateTileMeta(selectedTileIdx, { [arcKey]: newVal })
        setSelectedTileMeta(prev => ({ ...prev, [arcKey]: newVal }))
        return
      }

      // Arrow key navigation
      const DIRS = {
        ArrowRight: [1, 0],
        ArrowLeft:  [-1, 0],
        ArrowDown:  [0, 1],
        ArrowUp:    [0, -1],
      }
      const dir = DIRS[e.key]
      if (!dir) return
      e.preventDefault()

      const shapes = canvasRef.current?.getShapes()
      if (!shapes) return
      const currentShape = shapes[selectedTileIdx]
      if (!currentShape?.[0] || currentShape[0].length < 3) return

      const pts0 = currentShape[0]
      const n0 = pts0.length
      const cx = pts0.reduce((s, p) => s + p[0], 0) / n0
      const cy = pts0.reduce((s, p) => s + p[1], 0) / n0

      // Pick the neighbor whose centroid is most "in the direction" of the arrow.
      // Score = dot(to_candidate, dir) / dist² = cos(angle) / dist — favours
      // nearby tiles that are closely aligned with the pressed direction.
      let bestIdx = -1
      let bestScore = -Infinity
      for (const [pts, meta] of shapes) {
        if (meta._idx === selectedTileIdx) continue
        if (!pts || pts.length < 3) continue
        const n = pts.length
        const tx = pts.reduce((s, p) => s + p[0], 0) / n
        const ty = pts.reduce((s, p) => s + p[1], 0) / n
        const dx = tx - cx
        const dy = ty - cy
        const dot = dx * dir[0] + dy * dir[1]
        if (dot <= 0) continue
        const score = dot / (dx * dx + dy * dy)
        if (score > bestScore) {
          bestScore = score
          bestIdx = meta._idx
        }
      }

      if (bestIdx >= 0) {
        const meta = canvasRef.current.getTileMeta(bestIdx)
        setSelectedTileIdx(bestIdx)
        setSelectedTileMeta(meta)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTruchet, selectedTileIdx, selectedTileMeta])

  return (
    <div className="app">
      <StarryCanvas />

      <div className="canvas-layer">
        <AntwerpCanvas
          ref={canvasRef}
          configuration={TILINGS[tilingIndex].config}
          mode="motif"
          theta={thetaDeg * Math.PI / 180}
          parquetDirection={parquetDirection}
          thetaMin={thetaMinDeg * Math.PI / 180}
          thetaMax={thetaMaxDeg * Math.PI / 180}
          radius={radius}
          delta={delta}
          debug={debug}
          thick={thick}
          bandWidth={bandWidth}
          overlap={thick}
          overlapGap={0}
          showMotif={showMotif}
          parquetFunction={parquetFunction}
          animSpeed={animSpeed}
          linearAngle={linearAngle}
          centerX={parquetCenterX}
          centerY={parquetCenterY}
          ellipseAngle={ellipseAngle}
          ellipseMajorScale={ellipseMajorScale}
          ellipseMinorScale={ellipseMinorScale}
          parquetEffect={parquetEffect}
          effectStrength={effectStrength}
          effectRadius={effectRadius}
          onParquetParamChange={updates => {
            if (updates.linearAngle !== undefined) setLinearAngle(updates.linearAngle)
            if (updates.centerX !== undefined) setParquetCenterX(updates.centerX)
            if (updates.centerY !== undefined) setParquetCenterY(updates.centerY)
            if (updates.ellipseAngle !== undefined) setEllipseAngle(updates.ellipseAngle)
            if (updates.ellipseMajorScale !== undefined) setEllipseMajorScale(updates.ellipseMajorScale)
            if (updates.ellipseMinorScale !== undefined) setEllipseMinorScale(updates.ellipseMinorScale)
          }}
          onTileClick={(idx, meta) => {
            setSelectedTileIdx(idx)
            setSelectedTileMeta(meta)
          }}
          selectedTileIdx={selectedTileIdx}
        />
      </div>

      <div className="controls-shelf">
        <button className="shelf-handle" onClick={() => setShelfCollapsed(c => !c)}>
          <svg
            width="16" height="16" viewBox="0 0 16 16"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={shelfCollapsed ? '' : 'chevron-down'}
          >
            <polyline points="3,10 8,5 13,10"/>
          </svg>
        </button>

        <div className={`shelf-body${shelfCollapsed ? ' collapsed' : ''}`}>
          <div className="shelf-body-inner">

            <div className="control-group">
              <label>Pattern</label>
              <button className="pattern-picker-btn" onClick={() => setGalleryOpen(true)}>
                <span className="pattern-picker-label">{TILINGS[tilingIndex].label.replace(/^\d+-Uniform:\s*/, '').replace(/^Quasi-periodic:\s*/, '').replace(/^Truchet:\s*/, '')}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,4 5,7 8,4"/>
                </svg>
              </button>
            </div>

            <div className="control-group">
              <label htmlFor="radius-slider">Radius</label>
              <input
                id="radius-slider"
                type="range"
                min={0.05} max={1} step={0.05}
                value={radius}
                onChange={e => setRadius(Number(e.target.value))}
              />
              <span className="slider-value">{Math.round(radius * 100)}%</span>
            </div>

            <div className="shelf-divider" />

            <div className="control-group">
              <label htmlFor="motif-check">Motif</label>
              <input
                id="motif-check"
                type="checkbox"
                checked={showMotif}
                onChange={e => setShowMotif(e.target.checked)}
              />
            </div>

            <div className="shelf-divider" />

            {!isAnyTruchet && (
              <>
            <div className="control-group">
              <label>Parquet</label>
              <div className="parquet-toggle">
                <button
                  className={parquetDirection === 'none' ? 'active' : ''}
                  onClick={() => { setParquetDirection('none'); setParquetEffect('none') }}
                  title="Off"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <line x1="4" y1="10" x2="16" y2="10"/>
                  </svg>
                </button>
                <button
                  className={parquetDirection === 'ltr' ? 'active' : ''}
                  onClick={() => { setParquetDirection('ltr'); setLinearAngle(0); setParquetEffect('none') }}
                  title="Linear gradient (drag direction handle on canvas)"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="10" x2="15" y2="10"/><polyline points="13,8 15,10 13,12"/>
                    <path d="M 6,6 A 6 6 0 0 1 14,6" strokeWidth="1.2" strokeDasharray="2,1.5"/>
                    <path d="M 6,14 A 6 6 0 0 0 14,14" strokeWidth="1.2" strokeDasharray="2,1.5"/>
                  </svg>
                </button>
                <button
                  className={parquetDirection === 'centered' ? 'active' : ''}
                  onClick={() => { setParquetDirection('centered'); setParquetCenterX(0); setParquetCenterY(0) }}
                  title="Radial gradient (drag handles on canvas)"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/>
                    <line x1="10" y1="7" x2="10" y2="3"/><polyline points="8.5,4.5 10,3 11.5,4.5"/>
                    <line x1="10" y1="13" x2="10" y2="17"/><polyline points="8.5,15.5 10,17 11.5,15.5"/>
                    <line x1="13" y1="10" x2="17" y2="10"/><polyline points="15.5,8.5 17,10 15.5,11.5"/>
                    <line x1="7" y1="10" x2="3" y2="10"/><polyline points="4.5,8.5 3,10 4.5,11.5"/>
                  </svg>
                </button>
                <button
                  className={parquetDirection === 'fn' ? 'active' : ''}
                  onClick={() => { setParquetDirection('fn'); setParquetEffect('none') }}
                  title="Animated function"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M 2,10 C 4,4 6,4 8,10 C 10,16 12,16 14,10 C 16,4 18,4 19,7"/>
                    <circle cx="19" cy="7" r="1.2" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
              </div>
            </div>

            {parquetDirection === 'fn' && (
              <div className="control-group">
                <label>Shape</label>
                <div className="parquet-fn-picker">
                  <button
                    className={parquetFunction === 'wave-ltr' ? 'active' : ''}
                    onClick={() => setParquetFunction('wave-ltr')}
                    title="Wave left to right"
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M 1,10 C 3,4 5,4 7,10 C 9,16 11,16 13,10 C 15,4 17,4 19,10"/>
                      <polyline points="16,8 19,10 16,12" strokeWidth="1.2"/>
                    </svg>
                  </button>
                  <button
                    className={parquetFunction === 'wave-btt' ? 'active' : ''}
                    onClick={() => setParquetFunction('wave-btt')}
                    title="Wave bottom to top"
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M 10,19 C 4,17 4,15 10,13 C 16,11 16,9 10,7 C 4,5 4,3 10,1"/>
                      <polyline points="8,4 10,1 12,4" strokeWidth="1.2"/>
                    </svg>
                  </button>
                  <button
                    className={parquetFunction === 'ripple' ? 'active' : ''}
                    onClick={() => setParquetFunction('ripple')}
                    title="Ripple from center"
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none"/>
                      <circle cx="10" cy="10" r="4.5" opacity="0.7"/>
                      <circle cx="10" cy="10" r="8" opacity="0.35"/>
                    </svg>
                  </button>
                  <button
                    className={parquetFunction === 'pulse' ? 'active' : ''}
                    onClick={() => setParquetFunction('pulse')}
                    title="Global pulse"
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M 1,10 L 5,10 L 7,4 L 9,16 L 11,4 L 13,16 L 15,10 L 19,10"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {parquetDirection === 'ltr' && (
              <div className="control-group">
                <label htmlFor="linear-angle-slider">Direction</label>
                <input
                  id="linear-angle-slider"
                  type="range"
                  min={0} max={359} step={1}
                  value={Math.round(((linearAngle * 180 / Math.PI) % 360 + 360) % 360)}
                  onChange={e => setLinearAngle(Number(e.target.value) * Math.PI / 180)}
                />
                <span className="slider-value">{Math.round(((linearAngle * 180 / Math.PI) % 360 + 360) % 360)}°</span>
              </div>
            )}

            {parquetDirection === 'centered' && (
              <>
                <div className="control-group">
                  <label htmlFor="ellipse-angle-slider">Rotation</label>
                  <input
                    id="ellipse-angle-slider"
                    type="range"
                    min={0} max={179} step={1}
                    value={Math.round(((ellipseAngle * 180 / Math.PI) % 180 + 180) % 180)}
                    onChange={e => setEllipseAngle(Number(e.target.value) * Math.PI / 180)}
                  />
                  <span className="slider-value">{Math.round(((ellipseAngle * 180 / Math.PI) % 180 + 180) % 180)}°</span>
                </div>
                <div className="control-group">
                  <label htmlFor="ellipse-major-slider">Major</label>
                  <input
                    id="ellipse-major-slider"
                    type="range"
                    min={0.1} max={5} step={0.05}
                    value={ellipseMajorScale}
                    onChange={e => setEllipseMajorScale(Number(e.target.value))}
                  />
                  <span className="slider-value">{ellipseMajorScale.toFixed(2)}×</span>
                </div>
                <div className="control-group">
                  <label htmlFor="ellipse-minor-slider">Minor</label>
                  <input
                    id="ellipse-minor-slider"
                    type="range"
                    min={0.1} max={5} step={0.05}
                    value={ellipseMinorScale}
                    onChange={e => setEllipseMinorScale(Number(e.target.value))}
                  />
                  <span className="slider-value">{ellipseMinorScale.toFixed(2)}×</span>
                </div>
                <div className="control-group">
                  <label htmlFor="effect-select">Effect</label>
                  <select
                    id="effect-select"
                    value={parquetEffect}
                    onChange={e => setParquetEffect(e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="bulge">Bulge</option>
                    <option value="pinch">Pinch</option>
                    <option value="twist">Twist</option>
                  </select>
                </div>
                {parquetEffect !== 'none' && (
                  <>
                    <div className="control-group">
                      <label htmlFor="effect-strength-slider">Strength</label>
                      <input
                        id="effect-strength-slider"
                        type="range"
                        min={0} max={1} step={0.05}
                        value={effectStrength}
                        onChange={e => setEffectStrength(Number(e.target.value))}
                      />
                      <span className="slider-value">{effectStrength.toFixed(2)}</span>
                    </div>
                    <div className="control-group">
                      <label htmlFor="effect-radius-slider">Radius</label>
                      <input
                        id="effect-radius-slider"
                        type="range"
                        min={0.1} max={1} step={0.05}
                        value={effectRadius}
                        onChange={e => setEffectRadius(Number(e.target.value))}
                      />
                      <span className="slider-value">{effectRadius.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </>
            )}

            {parquetDirection === 'fn' && (
              <div className="control-group">
                <label htmlFor="anim-speed-slider">Speed</label>
                <input
                  id="anim-speed-slider"
                  type="range"
                  min={0} max={4} step={0.1}
                  value={animSpeed}
                  onChange={e => setAnimSpeed(Number(e.target.value))}
                />
                <span className="slider-value">{animSpeed.toFixed(1)}×</span>
              </div>
            )}

            {parquetDirection === 'none' ? (
              <div className="control-group">
                <label htmlFor="theta-slider">Angle</label>
                <input
                  id="theta-slider"
                  type="range"
                  min={10} max={80} step={1}
                  value={thetaDeg}
                  onChange={e => setThetaDeg(Number(e.target.value))}
                />
                <span className="slider-value">{thetaDeg}°</span>
              </div>
            ) : (
              <>
                <div className="control-group">
                  <label htmlFor="theta-min-slider">Min</label>
                  <input
                    id="theta-min-slider"
                    type="range"
                    min={10} max={80} step={1}
                    value={thetaMinDeg}
                    onChange={e => setThetaMinDeg(Number(e.target.value))}
                  />
                  <span className="slider-value">{thetaMinDeg}°</span>
                </div>
                <div className="control-group">
                  <label htmlFor="theta-max-slider">Max</label>
                  <input
                    id="theta-max-slider"
                    type="range"
                    min={10} max={80} step={1}
                    value={thetaMaxDeg}
                    onChange={e => setThetaMaxDeg(Number(e.target.value))}
                  />
                  <span className="slider-value">{thetaMaxDeg}°</span>
                </div>
              </>
            )}

              </>
            )}

            <div className="shelf-divider" />

            {!isAnyTruchet && (
              <>
            <div className="control-group">
              <label htmlFor="delta-slider">Delta</label>
              <input
                id="delta-slider"
                type="range"
                min={0} max={0.9} step={0.01}
                value={delta}
                onChange={e => setDelta(Number(e.target.value))}
              />
              <span className="slider-value">{delta.toFixed(2)}</span>
            </div>

            <div className="control-group">
              <label htmlFor="thick-check">Thick</label>
              <input
                id="thick-check"
                type="checkbox"
                checked={thick}
                onChange={e => setThick(e.target.checked)}
              />
            </div>

            {thick && (
              <div className="control-group">
                <label htmlFor="bandwidth-slider">Width</label>
                <input
                  id="bandwidth-slider"
                  type="range"
                  min={0.01} max={0.5} step={0.01}
                  value={bandWidth}
                  onChange={e => setBandWidth(Number(e.target.value))}
                />
                <span className="slider-value">{bandWidth.toFixed(2)}</span>
              </div>
            )}

            <div className="shelf-divider" />
              </>
            )}

            {isAnyTruchet && selectedTileMeta && (() => {
              const nVerts      = isSquareTruchet ? 4 : 3
              const vertColors  = isSquareTruchet ? SQUARE_VERTEX_COLORS : VERTEX_COLORS
              const aCount      = (selectedTileMeta.arcCount ?? 15) - 2
              const vertexLabels = ['A', 'B', 'C', ...(isSquareTruchet ? ['D'] : [])]
              return (
                <>
                  <div className="control-group">
                    <label>Tile</label>
                    <button className="rotate-btn" onClick={() => updateTileMeta({ startPt: (selectedTileMeta.startPt + 1) % nVerts })}>
                      ↻ Rotate
                    </button>
                  </div>
                  {(selectedTileMeta.size === 'large' || selectedTileMeta.size === 'medium') && (
                    <div className="control-group">
                      <label>Split</label>
                      <button className="rotate-btn" onClick={() => {
                        canvasRef.current?.subdivideTile(selectedTileIdx)
                        setSelectedTileIdx(-1)
                        setSelectedTileMeta(null)
                      }}>
                        ⊞ {selectedTileMeta.size === 'large' ? '→ Medium' : '→ Small'}
                      </button>
                    </div>
                  )}
                  {(selectedTileMeta.size === 'medium' || selectedTileMeta.size === 'small') &&
                    canvasRef.current?.canMergeTile(selectedTileIdx) && (
                    <div className="control-group">
                      <label>Merge</label>
                      <button className="rotate-btn" onClick={() => {
                        const newIdx = canvasRef.current?.mergeTile(selectedTileIdx)
                        if (newIdx >= 0) {
                          const meta = canvasRef.current?.getTileMeta(newIdx)
                          setSelectedTileIdx(newIdx)
                          setSelectedTileMeta(meta)
                        } else {
                          setSelectedTileIdx(-1)
                          setSelectedTileMeta(null)
                        }
                      }}>
                        ⊟ {selectedTileMeta.size === 'medium' ? '→ Large' : '→ Medium'}
                      </button>
                    </div>
                  )}
                  {vertexLabels.map((v, i) => {
                    const sk = `suppress${v}`
                    const rk = `arcRange${v}`
                    const suppressed = !!selectedTileMeta[sk]
                    const defaultMax = v === 'D' ? Math.min(2, aCount)
                                     : v === 'C' && !isSquareTruchet ? Math.min(3, aCount)
                                     : aCount
                    const range = selectedTileMeta[rk] ?? [1, defaultMax]
                    return (
                      <div key={v} className="control-group vertex-editor">
                        <span className="vertex-label" style={{ color: vertColors[i] }}>{v}</span>
                        <label className="suppress-label">
                          <input type="checkbox" checked={suppressed}
                            onChange={e => updateTileMeta({ [sk]: e.target.checked })} />
                          off
                        </label>
                        <input type="range" min={1} max={Math.max(1, range[1])} value={range[0]}
                          disabled={suppressed}
                          className="arc-range-input"
                          onChange={e => updateTileMeta({ [rk]: [Number(e.target.value), range[1]] })} />
                        <input type="range" min={Math.min(range[0], aCount)} max={aCount} value={range[1]}
                          disabled={suppressed}
                          className="arc-range-input"
                          onChange={e => updateTileMeta({ [rk]: [range[0], Number(e.target.value)] })} />
                        <span className="slider-value">{range[0]}–{range[1]}</span>
                      </div>
                    )
                  })}
                  <div className="shelf-divider" />
                </>
              )
            })()}

            <div className="control-group">
              <button className="export-btn" onClick={() => canvasRef.current?.exportSVG()}>
                Export SVG
              </button>
            </div>

            <label className="debug-toggle">
              <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} />
              debug
            </label>

          </div>
        </div>
      </div>

      {galleryOpen && (
        <TilingGallery
          tilings={TILINGS}
          selectedIndex={tilingIndex}
          onSelect={setTilingIndex}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </div>
  )
}
