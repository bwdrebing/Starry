import { useState } from 'react'
import StarryCanvas from './StarryCanvas'
import AntwerpCanvas from './AntwerpCanvas'
import './App.css'

const TILINGS = [
  { label: '3⁶ — Triangular',                config: '3/m30/r(h2)' },
  { label: '4⁴ — Square',                     config: '4/m45/r(h1)' },
  { label: '6³ — Hexagonal',                  config: '6/m30/r(h1)' },
  { label: '(3.6)² — Trihexagonal',           config: '6-3-6/m30/r(v4)' },
  { label: '3.4.6.4 — Rhombitrihexagonal',    config: '6-4-3/m30/r(c2)' },
  { label: '4.6.12 — Truncated Trihexagonal', config: '12-6,4/m30/r(c2)' },
  { label: '3.12² — Truncated Hexagonal',     config: '12-3/m30/r(h3)' },
  { label: '4.8² — Truncated Square',         config: '8-4/m90/r(h4)' },
  { label: '3³.4² — Elongated Triangular',    config: '4-3/m90/r(h2)' },
  { label: '3⁴.6 — Snub Hexagonal',           config: '6-3-3/r60/r(h5)' },
]

export default function App() {
  const [tilingIndex, setTilingIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('tiling')
  const [thetaDeg, setThetaDeg] = useState(45)
  const [delta, setDelta] = useState(0)
  const [debug, setDebug] = useState(false)
  const [thick, setThick] = useState(false)
  const [overlap, setOverlap] = useState(false)

  return (
    <div className="app">
      <StarryCanvas />
      <div className="card">
        <div className="card-canvas">
          <AntwerpCanvas
            configuration={TILINGS[tilingIndex].config}
            mode={activeTab}
            theta={thetaDeg * Math.PI / 180}
            delta={delta}
            debug={debug}
            thick={thick}
            overlap={overlap}
          />
        </div>
        <div className="card-controls">
          <div className="tabs">
            {['tiling', 'motif'].map(tab => (
              <button
                key={tab}
                className={`tab${activeTab === tab ? ' tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="tab-controls">
            {activeTab === 'tiling' && (
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
            )}

            {activeTab === 'motif' && (
              <>
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
                  <div className="control-group">
                    <label htmlFor="overlap-check">Overlap</label>
                    <input
                      id="overlap-check"
                      type="checkbox"
                      checked={overlap}
                      onChange={e => setOverlap(e.target.checked)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <label className="debug-toggle">
        <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} />
        debug
      </label>
    </div>
  )
}
