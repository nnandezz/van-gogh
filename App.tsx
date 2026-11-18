import { useEffect, useRef, useState } from 'react'
import { PropertiesPanel } from './components/PropertiesPanel'
import { ToolRail } from './components/ToolRail'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import type { ImageDocument, ToolId } from './types'

export default function App() {
  const [image, setImage] = useState<ImageDocument | null>(null)
  const [zoom, setZoom] = useState(100)
  const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const importImage = () => inputRef.current?.click()
  const exportImage = () => {
    if (!image) return
    const link = document.createElement('a')
    link.href = image.url
    link.download = image.name
    link.click()
  }
  const loadFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const probe = new Image()
    probe.onload = () => setImage({ name: file.name, url, width: probe.naturalWidth, height: probe.naturalHeight, size: file.size })
    probe.onerror = () => URL.revokeObjectURL(url)
    probe.src = url
    setZoom(100)
  }

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])

  return <div className={`app-shell${dragging ? ' is-dragging' : ''}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
    onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]) }}>
    <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = '' }} />
    <TopBar image={image} onImport={importImage} onExport={exportImage} />
    <div className="editor-layout">
      <ToolRail activeTool={activeTool} onSelect={setActiveTool} />
      <Workspace image={image} zoom={zoom} onZoomChange={setZoom} onImport={importImage} />
      <PropertiesPanel activeTool={activeTool} hasImage={Boolean(image)} />
    </div>
    {dragging && <div className="drop-overlay"><div className="drop-card"><span className="drop-icon">↓</span><strong>Suelta tu imagen aquí</strong><span>JPG, PNG, WEBP o GIF</span></div></div>}
  </div>
}
