import type { ReactNode, SVGProps } from 'react'

export type IconName = 'mark' | 'undo' | 'redo' | 'upload' | 'download' | 'crop' | 'resize' | 'rotate' | 'text' | 'filters' | 'adjust' | 'chevron' | 'plus' | 'minus' | 'fit' | 'image' | 'info' | 'close' | 'check'

const paths: Record<IconName, ReactNode> = {
  mark: <><path d="M12 2.8c2.1 3.4 6.8 5.1 6.8 10.1a6.8 6.8 0 1 1-13.6 0C5.2 8 9.9 6.2 12 2.8Z"/><path d="M9 15.5c.4 1.4 1.4 2.1 2.8 2.1"/></>,
  undo: <><path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h8a6 6 0 0 1 0 12" transform="translate(0 -6)"/></>,
  redo: <><path d="m15 7 4.5 4.5L15 16"/><path d="M19 11.5h-8a6 6 0 0 0 0 12" transform="translate(0 -6)"/></>,
  upload: <><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></>,
  download: <><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></>,
  crop: <><path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/></>,
  resize: <><path d="M4 9V4h5M20 15v5h-5M4 4l6 6m10 10-6-6"/><path d="M14 4h6v6M4 14v6h6"/></>,
  rotate: <><path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 3v5h5M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 21v-5h-5"/></>,
  text: <><path d="M4 6V4h16v2M12 4v16m-4 0h8"/></>,
  filters: <><path d="M4 5h16M7 12h10m-7 7h4"/><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="11" cy="19" r="1.5"/></>,
  adjust: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  minus: <path d="M5 12h14"/>,
  fit: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/><path d="M8 8h8v8H8z"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
}

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}
