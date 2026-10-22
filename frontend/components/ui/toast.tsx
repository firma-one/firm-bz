"use client"

import { useState, useCallback, useEffect, useMemo, useRef, createContext, useContext, ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** A button in the toast that acts on what just happened ("Undo", "Open"). It closes the toast. */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  action?: ToastAction
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

/** What screen readers are told: the newest toast, politely, or at once for a failure. */
type Announcement = { text: string; assertive: boolean; n: number }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    const newToast = { ...toast, id }
    // A newer toast with the same title replaces the older one rather than stacking a
    // duplicate, so it is the latest message (and the latest Undo) that shows.
    setToasts(prev => [...prev.filter(t => t.title !== newToast.title), newToast])
    setAnnouncement(prev => ({
      text: [toast.title, toast.message].filter(Boolean).join('. '),
      assertive: toast.type === 'error' || toast.type === 'warning',
      n: (prev?.n ?? 0) + 1,
    }))
  }, [])

  const ctx = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast])

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Always in the page, so screen readers are listening before a toast arrives — a live
          region that mounts together with its text is often not read at all. Keyed, so the same
          message twice is read twice. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement && !announcement.assertive && <span key={announcement.n}>{announcement.text}</span>}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement?.assertive && <span key={announcement.n}>{announcement.text}</span>}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) throw new Error('useToast must be used within a ToastProvider')
  return context
}

// ── Animated tick ────────────────────────────────────────────────
function AnimatedTick() {
  return (
    <>
      <style>{`
        @keyframes toast-circle {
          from { stroke-dashoffset: 56.5; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes toast-check {
          from { stroke-dashoffset: 16; }
          to   { stroke-dashoffset: 0; }
        }
        .toast-circle { animation: toast-circle 1s cubic-bezier(0.65,0,0.45,1) forwards; }
        .toast-check  { animation: toast-check  0.25s cubic-bezier(0.65,0,0.45,1) 0.85s forwards; }
        /* Reduced motion: the finished tick, drawn at once. */
        @media (prefers-reduced-motion: reduce) {
          .toast-circle, .toast-check { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="1.75"
          strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset="56.5"
          className="toast-circle" />
        <path d="M9.5 14.5 L12.5 17.5 L18.5 11" stroke="currentColor" strokeWidth="1.75"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="16" strokeDashoffset="16"
          className="toast-check" />
      </svg>
    </>
  )
}

// ── Config ───────────────────────────────────────────────────────
const TOAST_CONFIG: Record<ToastType, { icon: ReactNode; chip: string }> = {
  success: { icon: <AnimatedTick />, chip: 'bg-action/10 text-action' },
  error: { icon: <AlertCircle className="h-4 w-4" />, chip: 'bg-tag-red-bg text-danger' },
  warning: { icon: <AlertTriangle className="h-4 w-4" />, chip: 'bg-tag-yellow-bg text-tag-yellow-fg' },
  info: { icon: <Info className="h-4 w-4" />, chip: 'bg-tag-gray-bg text-tag-gray-fg' },
}

/** How long a success or info toast stays. Errors and warnings stay until dismissed. */
const DEFAULT_DURATION_MS = 8000

// ── Container ────────────────────────────────────────────────────
const MAX_PEEK = 3

function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const expanded = hovered && toasts.length > 1

  // Nothing left to hover or focus once the last toast goes.
  useEffect(() => {
    if (toasts.length === 0) { setHovered(false); setFocused(false) }
  }, [toasts.length])

  if (toasts.length === 0) return null

  // newest first
  const reversed = [...toasts].reverse()
  const peekCount = Math.min(toasts.length - 1, MAX_PEEK - 1)

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed z-[150] w-[320px] max-w-[calc(100vw-2.5rem)]"
      // Clear of the docked right pane and the docked Brio panel (each publishes its width), and
      // above the Brio panel when it floats in this corner (it publishes its height).
      style={{
        bottom: 'calc(1.25rem + var(--ai-chat-corner-offset, 0px))',
        right: 'calc(1.25rem + var(--ai-chat-dock-width, 0px) + var(--right-pane-dock-width, 0px))',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
    >
      {/* Header — only visible when expanded; faded out, it is also out of reach of Tab and
          screen readers, rather than an invisible "Clear all". */}
      <div
        inert={!expanded}
        aria-hidden={!expanded || undefined}
        className="flex items-center justify-between mb-2 transition-all duration-200"
        style={{ opacity: expanded ? 1 : 0, pointerEvents: expanded ? 'auto' : 'none', height: expanded ? 'auto' : 0, marginBottom: expanded ? 8 : 0 }}
      >
        <span className="text-caption font-medium text-fg-muted">
          {toasts.length} notifications
        </span>
        <button
          type="button"
          onClick={() => toasts.forEach(t => removeToast(t.id))}
          className="font-medium transition-colors text-caption text-fg-muted hover:text-fg"
        >
          Clear all
        </button>
      </div>

      {/* Stack */}
      <div
        className="relative transition-all duration-300"
        style={{ paddingBottom: !expanded && peekCount > 0 ? peekCount * 10 : 0 }}
      >
        {reversed.map((toast, idx) => {
          const isNewest = idx === 0
          const scale = expanded ? 1 : Math.max(1 - idx * 0.04, 0.88)
          const translateY = expanded ? 0 : idx * 10
          const opacity = expanded ? 1 : idx === 0 ? 1 : idx === 1 ? 0.65 : 0.35
          const invisible = !expanded && idx >= MAX_PEEK

          return (
            <div
              key={toast.id}
              className="transition-all duration-300"
              style={{
                position: expanded || isNewest ? 'relative' : 'absolute',
                top: expanded || isNewest ? undefined : 0,
                left: 0,
                right: 0,
                transform: `translateY(${translateY}px) scale(${scale})`,
                transformOrigin: 'bottom center',
                zIndex: reversed.length - idx,
                opacity: invisible ? 0 : opacity,
                pointerEvents: !expanded && !isNewest ? 'none' : 'auto',
                marginBottom: expanded && idx < reversed.length - 1 ? 8 : 0,
              }}
            >
              <ToastItem toast={toast} onRemove={removeToast} paused={hovered || focused} />
            </div>
          )
        })}
      </div>

      {/* Collapsed hint */}
      {!expanded && toasts.length > 1 && (
        <p className="mt-3 select-none text-center text-caption text-fg-subtle">
          +{toasts.length - 1} more · hover to expand
        </p>
      )}
    </div>
  )
}

// ── Item ─────────────────────────────────────────────────────────
function ToastItem({ toast, onRemove, paused }: { toast: Toast, onRemove: (id: string) => void, paused: boolean }) {
  const cfg = TOAST_CONFIG[toast.type]

  // Closes itself after its duration, but not while the pointer or focus is on the stack: an
  // "Undo" must not vanish as you reach for it. Errors and warnings stay until dismissed —
  // auto-closing a failure before it is read (an "Attach failed" toast) lets it go unnoticed.
  const sticky = toast.type === 'error' || toast.type === 'warning'
  const remainingRef = useRef(toast.duration ?? DEFAULT_DURATION_MS)
  useEffect(() => {
    if (sticky || paused) return
    const started = Date.now()
    const t = setTimeout(() => onRemove(toast.id), remainingRef.current)
    return () => {
      clearTimeout(t)
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - started))
    }
  }, [sticky, paused, onRemove, toast.id])

  return (
    <div className="flex w-full items-start gap-3 rounded-card bg-surface px-3 py-2.5 shadow-popover">
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-control', cfg.chip)}>
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-ui font-medium text-fg">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-small text-fg-muted">{toast.message}</p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); onRemove(toast.id) }}
          className="h-7 shrink-0 self-center rounded-control px-2 text-small font-medium text-action outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-action/30"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle outline-none transition-all hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-action/30"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
