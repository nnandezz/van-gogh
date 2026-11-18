export type ToolId = 'crop' | 'resize' | 'rotate' | 'text' | 'filters' | 'adjustments'

export interface ImageDocument {
  name: string
  url: string
  width: number
  height: number
  size: number
}
