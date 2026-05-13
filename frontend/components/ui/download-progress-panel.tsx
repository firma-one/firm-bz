'use client'

import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, Maximize2, Minimize2, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useDownloadProgress } from '@/lib/download-progress-context'
import { DocumentIcon } from '@/components/ui/document-icon'

export function DownloadProgressPanel() {
  const { tasks, dismiss } = useDownloadProgress()
  const [isOpen, setIsOpen] = useState(true)

  if (tasks.length === 0) return null
  if (typeof document === 'undefined' || !document.body) return null

  const completedCount = tasks.filter(t => t.status === 'complete').length
  const isPreparing = tasks.some(t => t.status === 'preparing')
  const headerLabel = isPreparing
    ? `Preparing download${tasks.length > 1 ? `s ${completedCount}/${tasks.length}` : '...'}`
    : `Download${tasks.length > 1 ? 's' : ''} complete ${completedCount}/${tasks.length}`

  return createPortal(
    <div className={cn(
      'fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border border-slate-200 z-[100] flex flex-col transition-all duration-300 w-[360px]',
      isOpen ? 'h-auto max-h-[400px]' : 'h-10'
    )}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 text-slate-900 rounded-t-lg cursor-pointer"
        onClick={() => setIsOpen(v => !v)}
      >
        <span className="text-[11px] font-medium">{headerLabel}</span>
        <div className="flex items-center gap-2 text-slate-500">
          {isOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <button
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            className="hover:bg-slate-200 rounded p-0.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 custom-scrollbar">
          {tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-1 px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  <DocumentIcon mimeType="application/pdf" className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-700 truncate font-medium" title={task.label}>{task.label}</p>
                  {task.status === 'error' && (
                    <p className="text-[10px] text-red-500 truncate">{task.error || 'Download failed'}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {task.status === 'preparing' && (
                    <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />
                  )}
                  {task.status === 'complete' && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-slate-900" />
                  )}
                  {task.status === 'error' && (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
