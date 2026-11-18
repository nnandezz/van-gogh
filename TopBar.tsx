import { Icon } from './Icon'
import type { ImageDocument } from '../types'

interface TopBarProps {
  image: ImageDocument | null
  onImport: () => void
  onExport: () => void
}

export function TopBar({ image, onImport, onExport }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><Icon name="mark" size={21} /></div>
        <span className="brand-name">van gogh</span>
        <span className="brand-divider" />
        <span className="brand-product">STUDIO</span>
      </div>
      <div className="project-name"><span className="project-dot" />{image?.name ?? 'Proyecto sin título'}</div>
      <div className="top-actions">
        <div className="history-actions" aria-label="Historial">
          <button className="icon-button" aria-label="Deshacer" title="Deshacer" disabled><Icon name="undo" /></button>
          <button className="icon-button" aria-label="Rehacer" title="Rehacer" disabled><Icon name="redo" /></button>
        </div>
        <span className="top-separator" />
        <button className="button button-secondary import-top" onClick={onImport}><Icon name="upload" size={16} /><span>Importar imagen</span></button>
        <button className="button button-primary" disabled={!image} onClick={onExport}><Icon name="download" size={16} /><span>Exportar</span></button>
      </div>
    </header>
  )
}
