'use client'

import React, { useEffect, useState } from 'react'
import { X, Expand, Minimize2, PanelRight, PanelRightOpen } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import Logo from '@/components/Logo'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'
import { useBranding } from '@/lib/use-branding'
import { useRightPane, type PaneSize } from '@/lib/right-pane-context'

const TRANSITION_MS = 300

/** Width of the docked right panel in 'small' state (px). */
export const RIGHT_PANEL_DOCKED_WIDTH_PX = 320
/** Width of the docked right panel in 'medium' state (px). */
export const RIGHT_PANEL_MEDIUM_WIDTH_PX = 480

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
  iconTooltip?: string
  children: React.ReactNode
  onClose: () => void
  headerActions?: React.ReactNode
  embedContent?: boolean
  dockedPosition?: DockedPosition
  /**
   * 'flush' (the New UI shell): the shell's column already draws the edge, so the panel adds no
   * card — the same flat surface as the docked Brio pane. 'card' (the onboarding frame, which floats
   * the panel in a margin): its own border and shadow.
   */
  frame?: 'card' | 'flush'
}

/** Header icon buttons, the same ghost buttons as the Brio pane's header. */
const HEADER_BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted'

/**
 * The panel's title row: one 44px row like the Brio pane's header — a small inline icon, the title
 * (and an optional subtitle under it), then the controls. No tinted icon tile.
 */
function PanelTitle({ icon, iconTooltip, title, subtitle }: { icon?: React.ReactNode; iconTooltip?: string; title: string; subtitle?: string }) {
  const iconNode = icon ? (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
  ) : null
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {iconNode && (iconTooltip ? <Hint label={iconTooltip} side="bottom">{iconNode}</Hint> : iconNode)}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-ui font-semibold text-fg">{title}</h2>
        {subtitle ? <p className="truncate text-caption text-fg-subtle">{subtitle}</p> : null}
      </div>
    </div>
  )
}

/** Icon + tooltip for the cycle button — shows where clicking will take you next. */
const CYCLE_META: Record<PaneSize, { icon: React.ReactNode; title: string; next: PaneSize }> = {
  small:  { icon: <PanelRightOpen className="h-4 w-4" />, title: 'Expand to medium',      next: 'medium' },
  medium: { icon: <Expand className="h-4 w-4" />,   title: 'Expand to full screen', next: 'large'  },
  large:  { icon: <PanelRight className="h-4 w-4" />, title: 'Collapse to side panel', next: 'small' },
}

export function LayoutRightPanel({
  title,
  subtitle,
  icon,
  iconTooltip,
  children,
  onClose,
  headerActions,
  embedContent = false,
  dockedPosition,
  frame = 'card',
}: LayoutRightPanelProps) {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const branding = useBranding()
  const { paneSize, setPaneSize } = useRightPane()
  const [panelEntered, setPanelEntered] = useState(false)
  const [overlayEntered, setOverlayEntered] = useState(false)
  const [closing, setClosing] = useState(false)

  const isLarge = paneSize === 'large'

  useEffect(() => {
    if (!isCollapsed) toggleSidebar()
  }, [])

  const handleClose = () => {
    if (closing) return
    setClosing(true)
    setOverlayEntered(false)
    setPanelEntered(false)
    if (isLarge) setPaneSize('small')
  }

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => onClose(), TRANSITION_MS)
    return () => clearTimeout(t)
  }, [closing, onClose])

  // Slide in docked panel
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelEntered(true))
    })
    return () => cancelAnimationFrame(t)
  }, [])

  // Overlay enter/exit
  useEffect(() => {
    if (isLarge) {
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOverlayEntered(true))
      })
      return () => cancelAnimationFrame(t)
    } else {
      setOverlayEntered(false)
    }
  }, [isLarge])

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

  const cycleMeta = CYCLE_META[paneSize]

  return (
    <>
      {/* Docked panel — visible in 'small' and 'medium' states */}
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
            'flex h-full w-full shrink-0 flex-col overflow-hidden bg-surface transition-all ease-out',
            frame === 'card' && 'rounded-card border border-line shadow-dialog',
            isLarge
              ? 'opacity-0 translate-x-1 pointer-events-none'
              : 'opacity-100 translate-x-0'
          )}
          style={{
            transform: panelEntered ? 'translateX(0)' : 'translateX(100%)',
            transitionDuration: `${TRANSITION_MS}ms`,
          }}
        >
          <header className="flex min-h-11 shrink-0 items-center gap-0.5 border-b border-line bg-surface py-1.5 pl-3 pr-1.5">
            <PanelTitle icon={icon} iconTooltip={iconTooltip} title={title} subtitle={subtitle} />
            {headerActions}
            {/* Single cycling button — the icon shows the next state. */}
            <Hint label={cycleMeta.title} side="bottom">
              <button type="button" className={HEADER_BUTTON} onClick={() => setPaneSize(cycleMeta.next)} aria-label={cycleMeta.title}>
                {cycleMeta.icon}
              </button>
            </Hint>
            <Hint label="Close" side="bottom">
              <button type="button" className={HEADER_BUTTON} onClick={handleClose} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Hint>
          </header>
          <div className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', !embedContent && 'p-4 overflow-y-auto')}>
            {children}
          </div>
        </aside>
      </div>

      {/* Full overlay — 'large' state */}
      <div
        className={cn(
          'fixed inset-0 z-[100] flex flex-col bg-surface-subtle transition-opacity ease-out',
          isLarge ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{
          visibility: isLarge ? 'visible' : 'hidden',
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
      >
        <header
          className={cn(
            'mx-4 mt-4 flex shrink-0 items-center gap-1 rounded-card border border-line bg-surface px-3 transition-transform ease-out',
            overlayEntered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          )}
          style={{ height: 52, transitionDuration: `${TRANSITION_MS}ms` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="xl" branding={branding ?? undefined} />
          </div>
          <div className="mx-2 h-6 w-px shrink-0 bg-line" />
          <PanelTitle icon={icon} iconTooltip={iconTooltip} title={title} subtitle={subtitle} />
          {/* Cycle from large → small */}
          <Hint label={CYCLE_META.large.title} side="bottom">
            <button type="button" className={HEADER_BUTTON} onClick={() => setPaneSize(CYCLE_META.large.next)} aria-label={CYCLE_META.large.title}>
              <Minimize2 className="h-4 w-4" />
            </button>
          </Hint>
          <Hint label="Close" side="bottom">
            <button type="button" className={HEADER_BUTTON} onClick={handleClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </Hint>
        </header>

        <div
          className={cn(
            'mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface transition-all ease-out',
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
