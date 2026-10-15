'use client'

import React, { useEffect } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'

/** Fixed width so the panel is never shrunk by flex (same as layout right panel). */
const PANEL_DOCKED_WIDTH_PX = 320

interface ShareDetailPanelProps {
  open: boolean
  isExpanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

/**
 * Right detail panel: opens at 20% width (pushes content), can expand to full overlay.
 * Single Close and Expand/Collapse controls. When opening, collapses the left AppBar.
 */
export function ShareDetailPanel({
  open,
  isExpanded,
  onExpand,
  onCollapse,
  onClose,
  title,
  children,
  className,
}: ShareDetailPanelProps) {
  const { isCollapsed, toggleSidebar } = useSidebar()

  // When panel opens, collapse left sidebar so content has room
  useEffect(() => {
    if (open && !isCollapsed) {
      toggleSidebar()
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Docked panel: fills wrapper (caller reserves PANEL_DOCKED_WIDTH_PX so flex never shrinks it) */}
      <aside
        className={cn(
          'flex flex-col h-full w-full min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300 ease-out shrink-0',
          isExpanded && 'hidden',
          className
        )}
        style={{ width: '100%' }}
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/60 bg-slate-50/80 shrink-0 rounded-t-2xl">
          <h2 className="text-sm font-semibold text-fg truncate flex-1 min-w-0" title={title}>
            {title}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-fg-muted hover:text-fg-muted hover:bg-slate-200/80"
              onClick={onExpand}
              title="Expand to full screen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-fg-muted hover:text-fg-muted hover:bg-slate-200/80"
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0 p-4">{children}</div>
      </aside>

      {/* Full overlay when expanded */}
      <div
        className={cn(
          'fixed inset-0 z-[100] flex flex-col bg-white rounded-none shadow-2xl transition-opacity duration-300 ease-out',
          isExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{ visibility: isExpanded ? 'visible' : 'hidden' }}
      >
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200/60 bg-slate-50/80 shrink-0">
          <h2 className="text-lg font-semibold text-fg truncate flex-1 min-w-0" title={title}>
            {title}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-line text-fg-muted hover:bg-surface-hover"
              onClick={onCollapse}
              title="Collapse to side panel"
            >
              <Minimize2 className="h-4 w-4 mr-1.5" />
              <span className="text-xs font-medium">Collapse</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl text-fg-muted hover:text-fg-muted hover:bg-slate-200/80"
              onClick={onClose}
              title="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0 p-6">{children}</div>
      </div>
    </>
  )
}
