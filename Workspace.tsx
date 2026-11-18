import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { ImageDocument } from '../types'

interface WorkspaceProps {
  image: ImageDocument | null
  zoom: number
  onZoomChange: (zoom: number) => void
  onImport: () => void
}

export function Workspace({ image, zoom, onZoomChange, onImport }: WorkspaceProps) {
  const zoomOut = () => onZoomChange(Math.max(25, zoom - 10))
  const zoomIn = () => onZoomChange(Math.min(200, zoom + 10))
  return <main className="workspace">
    <div className="canvas-area">
      {image ? <div className="image-stage" style={{ '--image-zoom': zoom / 100 } as CSSProperties}>
        <img className="canvas-image" src={image.url} alt={image.name} />
      </div> : <div className="empty-state">
        <div className="empty-art" aria-hidden="true"><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><div className="art-frame"><span className="art-sun" /><span className="art-mountain mountain-back" /><span className="art-mountain mountain-front" /><span className="art-ground" /></div><div className="art-cross cross-one" /><div className="art-cross cross-two" /></div>
        <div className="empty-copy"><span className="eyebrow">TU LIENZO TE ESPERA</span><h1>Todo empieza<br />con una imagen.</h1><p>Importa una fotografía para comenzar tu espacio de trabajo.</p>
          <button className="button button-primary empty-import" onClick={onImport}><Icon name="plus" size={17} />Importar imagen</button>
          <span className="file-hint">JPG, PNG, WEBP o GIF</span>
        </div>
      </div>}
    </div>
    <div className="canvas-toolbar">
      <div className="canvas-meta">{image ? <><Icon name="image" size={14} /><span>{image.width} × {image.height}</span><span className="meta-divider">·</span><span>{formatBytes(image.size)}</span></> : <><span className="canvas-ready-dot" />Espacio de trabajo listo</>}</div>
      <div className="zoom-controls">
        <button className="icon-button zoom-button" onClick={zoomOut} disabled={zoom <= 25} aria-label="Reducir zoom" title="Reducir zoom"><Icon name="minus" size={15} /></button>
        <span className="zoom-value">{zoom}%</span>
        <button className="icon-button zoom-button" onClick={zoomIn} disabled={zoom >= 200} aria-label="Aumentar zoom" title="Aumentar zoom"><Icon name="plus" size={15} /></button>
        <span className="zoom-divider" />
        <button className="icon-button zoom-button fit-button" onClick={() => onZoomChange(100)} aria-label="Restablecer zoom" title="Restablecer zoom"><Icon name="fit" size={16} /></button>
      </div>
    </div>
  </main>
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
