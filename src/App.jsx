import { useState } from 'react'
import StarryCanvas from './StarryCanvas'
import AntwerpCanvas from './AntwerpCanvas'
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
  { label: '3-Uniform: [(3⁶)²; 3³.4²]¹',                 config: '4-3-3-3-3-3/m90/r(h3)' },
  { label: '3-Uniform: [(3⁶)²; 3³.4²]²',                 config: '4-3-3-3-3/m90/r(h2)/m(h22)' },
  { label: '3-Uniform: (3.4.6.4)²; 3.4².6',              config: '6-4-3,4-6,3/m30/r(c2)' },
  // ── 3-Uniform (3 vertex types) ───────────────────────────────────────────
  { label: '3-Uniform: 3.4².6; 3.6.3.6; 4.6.12',         config: '12-6,4-3,3,4/m30/r(c5)' },
  { label: '3-Uniform: 3⁶; 3².4.12; 4.6.12',             config: '12-3,4,6-3/m60/m(c5)' },
  { label: '3-Uniform: 3⁶; 3².4.3.4; 3.4².6',            config: '3-4-3,4-6/m30/r(c5)' },
  { label: '3-Uniform: 3⁶; 3³.4²; 3².4.3.4',             config: '3-4-3-3/m30/r(h6)' },
  { label: '3-Uniform: 3⁶; 3³.4²; 3.4.6.4',              config: '6-4-3,4-3,3/m30/r(c5)' },
  { label: '3-Uniform: [3⁶; 3³.4²; 4⁴]¹',                config: '4-4-3-3/m90/r(h7)/r(v1)' },
  { label: '3-Uniform: [3⁶; 3³.4²; 4⁴]²',                config: '4-4-3-3-3/m90/r(h9)/r(h3)' },
  { label: '3-Uniform: [3⁶; 3⁴.6; 3².6²]³',              config: '6-3-3/m90/r(h2)' },
  { label: '3-Uniform: [3⁶; 3⁴.6; 3.6.3.6]³',            config: '3-3-6/r60/r(v4)' },
  { label: '3-Uniform: [3².6²; 3.6.3.6; 6³]¹',           config: '6-6-3,3,3/r60/r(h2)' },
]

export default function App() {
  const [tilingIndex, setTilingIndex] = useState(0)
  const [showMotif, setShowMotif] = useState(true)
  const [thetaDeg, setThetaDeg] = useState(45)
  const [delta, setDelta] = useState(0)
  const [debug, setDebug] = useState(false)
  const [thick, setThick] = useState(false)
  const [bandWidth, setBandWidth] = useState(0.2)
  const [overlap, setOverlap] = useState(false)
  const [overlapGap, setOverlapGap] = useState(0.05)

  return (
    <div className="app">
      <StarryCanvas />
      <div className="card">
        <div className="card-canvas">
          <AntwerpCanvas
            configuration={TILINGS[tilingIndex].config}
            mode="motif"
            theta={thetaDeg * Math.PI / 180}
            delta={delta}
            debug={debug}
            thick={thick}
            bandWidth={bandWidth}
            overlap={overlap}
            overlapGap={overlapGap}
            showMotif={showMotif}
          />
        </div>
        <div className="card-controls">
          <div className="control-group">
            <label htmlFor="tiling-select">Pattern</label>
            <select
              id="tiling-select"
              value={tilingIndex}
              onChange={e => setTilingIndex(Number(e.target.value))}
            >
              {TILINGS.map((t, i) => (
                <option key={t.config} value={i}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="motif-check">Motif</label>
            <input
              id="motif-check"
              type="checkbox"
              checked={showMotif}
              onChange={e => setShowMotif(e.target.checked)}
            />
          </div>

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
            <>
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

              <div className="control-group">
                <label htmlFor="overlap-check">Overlap</label>
                <input
                  id="overlap-check"
                  type="checkbox"
                  checked={overlap}
                  onChange={e => setOverlap(e.target.checked)}
                />
              </div>

              {overlap && (
                <div className="control-group">
                  <label htmlFor="gap-slider">Gap</label>
                  <input
                    id="gap-slider"
                    type="range"
                    min={0} max={0.3} step={0.005}
                    value={overlapGap}
                    onChange={e => setOverlapGap(Number(e.target.value))}
                  />
                  <span className="slider-value">{overlapGap.toFixed(3)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <label className="debug-toggle">
        <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} />
        debug
      </label>
    </div>
  )
}
