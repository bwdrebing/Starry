import { useEffect, useRef } from 'react'
import TilingThumbnail from './TilingThumbnail'

const GROUPS = [
  { label: '1-Uniform', prefix: '1-Uniform' },
  { label: '2-Uniform', prefix: '2-Uniform' },
  { label: '3-Uniform', prefix: '3-Uniform' },
  { label: 'Quasi-periodic', prefix: 'Quasi-periodic' },
]

function shortLabel(label) {
  // Strip the "N-Uniform: " or "Quasi-periodic: " prefix for display
  return label.replace(/^\d+-Uniform:\s*/, '').replace(/^Quasi-periodic:\s*/, '')
}

export default function TilingGallery({ tilings, selectedIndex, onSelect, onClose }) {
  const overlayRef = useRef(null)
  const selectedRef = useRef(null)

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll selected item into view on open
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  }, [])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="gallery-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="gallery-panel">
        <div className="gallery-header">
          <span className="gallery-title">Select Pattern</span>
          <button className="gallery-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="12" y2="12"/>
              <line x1="12" y1="2" x2="2" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="gallery-scroll">
          {GROUPS.map(group => {
            const items = tilings
              .map((t, i) => ({ ...t, index: i }))
              .filter(t => t.label.startsWith(group.prefix))
            if (items.length === 0) return null
            return (
              <div key={group.label} className="gallery-group">
                <div className="gallery-group-label">{group.label}</div>
                <div className="gallery-grid">
                  {items.map(({ label, config, index }) => (
                    <button
                      key={config}
                      ref={index === selectedIndex ? selectedRef : null}
                      className={`gallery-item${index === selectedIndex ? ' selected' : ''}`}
                      onClick={() => { onSelect(index); onClose() }}
                      title={label}
                    >
                      <TilingThumbnail configuration={config} size={88} render={index < 8} />
                      <span className="gallery-item-label">{shortLabel(label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
