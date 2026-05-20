"use client"

import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
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

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast = { ...toast, id }
    setToasts(prev => {
      if (prev.find(t => t.title === newToast.title)) return prev
      return [...prev, newToast]
    })
    const duration = toast.duration ?? 15000
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

function AnimatedTick() {
  // Circle circumference = 2π × 9 ≈ 56.5
  // Check path length ≈ 16
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
        <circle
          cx="14" cy="14" r="9"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray="56.5"
          strokeDashoffset="56.5"
          className="toast-circle"
        />
        <path
          d="M9.5 14.5 L12.5 17.5 L18.5 11"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="16"
          strokeDashoffset="16"
          className="toast-check"
        />
      </svg>
    </>
  )
}

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

function ToastItem({ toast, onRemove }: { toast: Toast, onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const cfg = TOAST_CONFIG[toast.type]

  return (
    <div
      className={`
        flex items-start gap-3 w-[320px] bg-white border border-[#e5e7eb] ${cfg.accentClass}
        shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)]
        px-3.5 py-3 transition-all duration-200
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      {/* Icon */}
      <div className={`shrink-0 h-7 w-7 flex items-center justify-center ${cfg.iconBgClass} ${cfg.iconColorClass}`}>
        {cfg.icon}
      </div>

      {/* Text */}
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

      {/* Dismiss */}
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 mt-0.5 text-[#9a9ba0] hover:text-[#45474c] transition-colors focus:outline-none"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
