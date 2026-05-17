'use client'

import React, { useEffect, useState } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Logo from '@/components/Logo'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'
import { useFirmBranding } from '@/lib/use-firm-branding'
import { useRightPane } from '@/lib/right-pane-context'

const TRANSITION_MS = 300

/** Width of the docked right panel (px). Layouts reserve this so the panel + iframe are visible. */
export const RIGHT_PANEL_DOCKED_WIDTH_PX = 320

export type DockedPosition = {
  top: number
  bottom: number
  right: number
  widthPx: number
}

interface LayoutRightPanelProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
  onClose: () => void
  /** Optional actions (e.g. Search icon) to show in the panel header next to the title */
  headerActions?: React.ReactNode
  /** When true, content is iframe/embed and should not get extra padding in overlay */
  embedContent?: boolean
  /** When set, docked panel uses fixed positioning so width is never shrunk by flex layout */
  dockedPosition?: DockedPosition
}

/**
 * Layout-level right panel: 20% width (pushes main content), expand to full overlay.
 * Single Close and Expand/Collapse. Collapses left AppBar when open.
 * Content is dynamic: any caller can set title + content via RightPaneContext (e.g. document Edit, Preview, share detail).
 */
export function LayoutRightPanel({
  title,
  subtitle,
  icon,
  children,
  onClose,
  headerActions,
  embedContent = false,
  dockedPosition,
}: LayoutRightPanelProps) {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const branding = useFirmBranding()
  const { isExpanded, setExpanded } = useRightPane()
  const [panelEntered, setPanelEntered] = useState(false)
  const [overlayEntered, setOverlayEntered] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!isCollapsed) {
      toggleSidebar()
    }
  }, [])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setOverlayEntered(false)
    setPanelEntered(false)
    if (isExpanded) setExpanded(false)
  }

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => onClose(), TRANSITION_MS)
    return () => clearTimeout(t)
  }, [closing, onClose])

  // Sliding-in: 20% panel enters from the right
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelEntered(true))
    })
    return () => cancelAnimationFrame(t)
  }, [])

  // Overlay enter/exit
  useEffect(() => {
    if (isExpanded) {
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOverlayEntered(true))
      })
      return () => cancelAnimationFrame(t)
    } else {
      setOverlayEntered(false)
    }
  }, [isExpanded])

  const dockedStyle = dockedPosition
    ? {
      position: 'fixed' as const,
      top: dockedPosition.top,
      bottom: dockedPosition.bottom,
      right: dockedPosition.right,
      width: dockedPosition.widthPx,
      maxWidth: dockedPosition.widthPx,
      minWidth: dockedPosition.widthPx,
      zIndex: 45,
    }
    : undefined

  return (
    <>
      {/* Docked panel: fixed position when dockedPosition set (guarantees width); else fills parent; aside slides in from right */}
      <div
        className={dockedPosition ? '' : 'w-full h-full flex flex-col overflow-hidden min-w-0'}
        style={
          dockedPosition
            ? { ...dockedStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
            : undefined
        }
      >
        <aside
          className={cn(
            'flex flex-col h-full w-full bg-white rounded-xl border border-[#e5e7eb] shadow-xl overflow-hidden transition-all ease-out shrink-0',
            isExpanded
              ? 'opacity-0 translate-x-1 pointer-events-none'
              : 'opacity-100 translate-x-0'
          )}
          style={{
            transform: panelEntered ? 'translateX(0)' : 'translateX(100%)',
            transitionDuration: `${TRANSITION_MS}ms`,
          }}
        >
          <header className="flex items-center justify-between gap-2 px-4 border-b border-[#e5e7eb] bg-white shrink-0 rounded-t-xl" style={{ height: subtitle ? 64 : 52 }}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {icon ? (
                <div className="h-8 w-8 rounded bg-[#ecfdf5] flex items-center justify-center text-[#069668] shrink-0">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 className="font-headline text-sm font-bold text-[#1b1b1d] truncate" title={title}>
                  {title}
                </h2>
                {subtitle ? (
                  <p className="font-mono text-[10px] text-[#45474c] uppercase tracking-wider truncate" title={subtitle}>
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {headerActions}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]"
                onClick={() => setExpanded(true)}
                title="Expand to full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]"
                onClick={handleClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', !embedContent && 'p-4 overflow-y-auto')}>
            {children}
          </div>
        </aside>
      </div>

      {/* Full overlay: top bar card (logo + collapse + close), smooth transition */}
      <div
        className={cn(
          'fixed inset-0 z-[100] flex flex-col bg-[#f9f9fb] transition-opacity ease-out',
          isExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{
          visibility: isExpanded ? 'visible' : 'hidden',
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
      >
        {/* Top bar card - match dashboard top bar look */}
        <header
          className={cn(
            'mx-4 mt-4 rounded border border-[#e5e7eb] bg-white shadow-sm flex items-center shrink-0 transition-transform ease-out',
            overlayEntered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          )}
          style={{
            height: 56,
            paddingLeft: 16,
            paddingRight: 16,
            transitionDuration: `${TRANSITION_MS}ms`,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Logo size="xl" branding={branding ?? undefined} />
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded border-[#e5e7eb] text-[#45474c] hover:bg-[#f0edee] h-9"
              onClick={() => setExpanded(false)}
              title="Collapse to side panel"
            >
              <Minimize2 className="h-4 w-4 mr-1.5" />
              <span className="text-xs font-medium">Collapse</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]"
              onClick={handleClose}
              title="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Content area - fills rest, with subtle enter */}
        <div
          className={cn(
            'flex-1 min-h-0 flex flex-col overflow-hidden mt-4 mx-4 mb-4 rounded-xl border border-[#e5e7eb] bg-white shadow-sm transition-all ease-out',
            overlayEntered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          )}
          style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        >
          <div className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', !embedContent && 'p-6 overflow-y-auto')}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
