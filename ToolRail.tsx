import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { ToolId } from '../types'

interface Tool { id: ToolId; label: string; icon: IconName }
const tools: Tool[] = [
  { id: 'crop', label: 'Recortar', icon: 'crop' },
  { id: 'resize', label: 'Redimensionar', icon: 'resize' },
  { id: 'rotate', label: 'Rotación', icon: 'rotate' },
  { id: 'text', label: 'Texto', icon: 'text' },
  { id: 'filters', label: 'Filtros', icon: 'filters' },
  { id: 'adjustments', label: 'Ajustes', icon: 'adjust' },
]

export function ToolRail({ activeTool, onSelect }: { activeTool: ToolId | null; onSelect: (tool: ToolId) => void }) {
  return <aside className="tool-rail" aria-label="Herramientas">
    <div className="rail-section-label">EDICIÓN</div>
    {tools.map((tool) => <button key={tool.id} className={`tool-item${activeTool === tool.id ? ' active' : ''}`} onClick={() => onSelect(tool.id)} aria-pressed={activeTool === tool.id}>
      <Icon name={tool.icon} size={19} /><span>{tool.label}</span><Icon name="chevron" size={14} className="tool-chevron" />
    </button>)}
    <div className="rail-footer"><span className="status-light" />Fase 01 <span className="status-muted">· Fotografía</span></div>
  </aside>
}
