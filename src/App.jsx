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

const TABS = ['tiling', 'motif']

export default function App() {
  const [tilingIndex, setTilingIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('tiling')

  return (
    <div className="app">
      <StarryCanvas />
      <div className="card">
        <div className="card-canvas">
          <AntwerpCanvas
            configuration={TILINGS[tilingIndex].config}
            mode={activeTab}
          />
        </div>
        <div className="card-controls">
          <div className="tabs">
            {TABS.map(tab => (
              <button
                key={tab}
                className={`tab${activeTab === tab ? ' tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
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
        </div>
      </div>
    </div>
  )
}
