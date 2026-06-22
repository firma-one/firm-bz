"use client"

import { useState, useCallback, useMemo, createContext, useContext, ReactNode } from 'react'
import { AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

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
  accentClass: string
  iconBgClass: string
  iconColorClass: string
}> = {
  success: {
    icon: <AnimatedTick />,
    accentClass: 'border-l-[3px] border-l-primary',
    iconBgClass: 'bg-primary/10',
    iconColorClass: 'text-primary',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    accentClass: 'border-l-[3px] border-l-red-500',
    iconBgClass: 'bg-red-50',
    iconColorClass: 'text-red-600',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    accentClass: 'border-l-[3px] border-l-[#d1d5db]',
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
      className="fixed bottom-5 right-5 z-[100] w-[320px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header — only visible when expanded */}
      <div
        className="flex items-center justify-between mb-2 transition-all duration-200"
        style={{ opacity: expanded ? 1 : 0, pointerEvents: expanded ? 'auto' : 'none', height: expanded ? 'auto' : 0, marginBottom: expanded ? 8 : 0 }}
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#9a9ba0]">
          {toasts.length} notifications
        </span>
        <button
          onClick={() => toasts.forEach(t => removeToast(t.id))}
          className="text-[11px] font-medium text-[#9a9ba0] hover:text-[#45474c] transition-colors"
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
        <p className="text-center mt-3 text-[10px] font-mono text-[#9a9ba0] tracking-wider select-none">
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
    <div className={`
      flex items-start gap-3 w-full bg-white border border-[#e5e7eb] ${cfg.accentClass}
      shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)]
      px-3.5 py-3
    `}>
      <div className={`shrink-0 h-7 w-7 flex items-center justify-center ${cfg.iconBgClass} ${cfg.iconColorClass}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-headline font-bold text-[0.8125rem] text-[#1b1b1d] leading-tight">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-0.5 text-xs text-[#45474c] leading-snug">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 h-6 w-6 flex items-center justify-center border border-transparent hover:border-[#e5e7eb] hover:bg-[#f3f4f6] text-[#9a9ba0] hover:text-[#45474c] transition-all focus:outline-none"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
