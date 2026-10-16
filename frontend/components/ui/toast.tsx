"use client"

import { useState, useCallback, useMemo, createContext, useContext, ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    const newToast = { ...toast, id }
    setToasts(prev => {
      if (prev.find(t => t.title === newToast.title)) return prev
      return [...prev, newToast]
    })
    // Error/warning toasts stay open until manually dismissed — auto-closing a failure message
    // before the user has read it (e.g. an "Attach failed" toast) risks the failure going
    // unnoticed, especially when the surrounding action otherwise looks like it succeeded.
    if (toast.type === 'error' || toast.type === 'warning') return
    const duration = toast.duration ?? 8000
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const ctx = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast])

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
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
      `}</style>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
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
const TOAST_CONFIG: Record<ToastType, {
  icon: ReactNode
  iconBgClass: string
  iconColorClass: string
}> = {
  success: {
    icon: <AnimatedTick />,
    iconBgClass: 'bg-primary/10',
    iconColorClass: 'text-primary',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    iconBgClass: 'bg-red-50',
    iconColorClass: 'text-red-600',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    iconBgClass: 'bg-amber-50',
    iconColorClass: 'text-amber-600',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    iconBgClass: 'bg-[#f3f4f6]',
    iconColorClass: 'text-[#45474c]',
  },
}

// ── Container ────────────────────────────────────────────────────
const MAX_PEEK = 3

function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const expanded = hovered && toasts.length > 1

  if (toasts.length === 0) return null

  // newest first
  const reversed = [...toasts].reverse()
  const peekCount = Math.min(toasts.length - 1, MAX_PEEK - 1)

  return (
    <div
      className="fixed bottom-5 right-5 z-[150] w-[320px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header — only visible when expanded */}
      <div
        className="flex items-center justify-between mb-2 transition-all duration-200"
        style={{ opacity: expanded ? 1 : 0, pointerEvents: expanded ? 'auto' : 'none', height: expanded ? 'auto' : 0, marginBottom: expanded ? 8 : 0 }}
      >
        <span className="font-bold [font-family:var(--font-ui)] text-caption normal-case tracking-normal text-fg-muted">
          {toasts.length} notifications
        </span>
        <button
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
              <ToastItem toast={toast} onRemove={removeToast} />
            </div>
          )
        })}
      </div>

      {/* Collapsed hint */}
      {!expanded && toasts.length > 1 && (
        <p className="text-center mt-3 select-none [font-family:var(--font-ui)] text-caption tracking-normal text-fg-subtle">
          +{toasts.length - 1} more · hover to expand
        </p>
      )}
    </div>
  )
}

// ── Item ─────────────────────────────────────────────────────────
function ToastItem({ toast, onRemove }: { toast: Toast, onRemove: (id: string) => void }) {
  const cfg = TOAST_CONFIG[toast.type]

  return (
    <div className="flex w-full items-start gap-3 rounded-card bg-white px-3 py-2.5 shadow-popover">
      <div className={`shrink-0 h-7 w-7 flex items-center justify-center rounded-control ${cfg.iconBgClass} ${cfg.iconColorClass}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-headline text-ui font-medium text-fg">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-0.5 text-small text-fg-muted">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 h-6 w-6 flex items-center justify-center transition-all focus:outline-none rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
