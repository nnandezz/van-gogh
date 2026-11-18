import { Icon } from './Icon'
import type { ToolId } from '../types'

const toolNames: Record<ToolId, string> = {
  crop: 'Recortar', resize: 'Redimensionar', rotate: 'Rotación', text: 'Texto', filters: 'Filtros', adjustments: 'Ajustes de imagen',
}

export function PropertiesPanel({ activeTool, hasImage }: { activeTool: ToolId | null; hasImage: boolean }) {
  return <aside className="properties-panel" aria-label="Propiedades">
    <div className="panel-heading"><div><span className="eyebrow">PANEL</span><h2>{activeTool ? toolNames[activeTool] : 'Propiedades'}</h2></div></div>
    {activeTool ? <div className="property-empty">
      <div className="property-icon"><Icon name={activeTool === 'adjustments' ? 'adjust' : activeTool} size={19} /></div>
      <p>{hasImage ? 'Esta herramienta estará disponible en una próxima fase.' : 'Importa una imagen para preparar esta herramienta.'}</p>
      <span className="coming-soon">{hasImage ? 'EN DESARROLLO' : 'SIN IMAGEN'}</span>
    </div> : <div className="property-empty default-property">
      <div className="property-icon"><Icon name="info" size={19} /></div>
      <p>Selecciona una herramienta para ver sus opciones.</p>
    </div>}
    <div className="panel-bottom"><div className="panel-bottom-rule" /><span>VAN GOGH STUDIO</span><span className="version">0.1</span></div>
  </aside>
}
