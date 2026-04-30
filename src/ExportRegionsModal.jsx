import { useMemo } from 'react'
import { regionToSVGString } from './regions'

export default function ExportRegionsModal({ regions, onClose }) {
  const previews = useMemo(
    () => regions.map(poly => regionToSVGString(poly, 100, 12, false)),
    [regions]
  )

  function downloadAll() {
    regions.forEach((poly, i) => {
      const svg = regionToSVGString(poly, 512, 48, true)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `region-${String(i + 1).padStart(2, '0')}.svg`
      a.click()
      URL.revokeObjectURL(url)
    })
    onClose()
  }

  return (
    <div className="regions-overlay" onClick={onClose}>
      <div className="regions-panel" onClick={e => e.stopPropagation()}>
        <div className="regions-header">
          <span className="regions-title">Export Regions</span>
          <button className="gallery-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="12" y2="12"/>
              <line x1="12" y1="2" x2="2" y2="12"/>
            </svg>
          </button>
        </div>

        <p className="regions-subtitle">
          {regions.length} unique region{regions.length !== 1 ? 's' : ''}, deduplicated by rotation
        </p>

        {regions.length === 0 ? (
          <p className="regions-empty">No regions found. Enable the Motif and use a non-Truchet pattern.</p>
        ) : (
          <div className="regions-grid">
            {previews.map((svg, i) => (
              <div
                key={i}
                className="region-cell"
                title={`Region ${i + 1}`}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </div>
        )}

        <div className="regions-footer">
          {regions.length > 0 && (
            <button className="export-btn" onClick={downloadAll}>
              Download {regions.length} SVG{regions.length !== 1 ? 's' : ''}
            </button>
          )}
          <button className="export-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
