'use client'

import { createPortal } from 'react-dom'
import { CheckCircle2, Clock, Folder, Maximize2, Minimize2, X, XCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useUploadProgress } from '@/lib/upload-progress-context'
import { useFirmBranding } from '@/lib/use-firm-branding'
import { DocumentIcon } from '@/components/ui/document-icon'
import { CoffeeIcon, type CoffeeIconHandle } from '@/components/ui/coffee-icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function UploadSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0 animate-spin">
      <circle cx="7" cy="7" r="5" fill="none" strokeWidth="2"
        style={{ stroke: 'hsl(var(--primary) / 0.2)' }} />
      <path d="M 7 2 A 5 5 0 0 1 12 7"
        fill="none" strokeWidth="2" strokeLinecap="round"
        style={{ stroke: 'hsl(var(--primary))' }} />
    </svg>
  )
}

export function UploadProgressPanel() {
  const {
    uploadQueue,
    isUploading,
    isUploadInitiating,
    isUploadModalOpen,
    setIsUploadModalOpen,
    onShowFileLocation,
    dismiss,
  } = useUploadProgress()

  const branding = useFirmBranding()
  const coffeeIconRef = useRef<CoffeeIconHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll: keep the currently uploading item in view
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>('[data-uploading="true"]')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [uploadQueue])

  useEffect(() => {
    if (isUploading || isUploadInitiating) {
      coffeeIconRef.current?.startAnimation()
    } else {
      coffeeIconRef.current?.stopAnimation()
    }
  }, [isUploading, isUploadInitiating])

  if (!uploadQueue.length && !isUploadInitiating) return null
  if (typeof document === 'undefined' || !document.body) return null

  const completedCount = uploadQueue.filter(i => i.status === 'completed').length
  const isActive = isUploading || isUploadInitiating

  return createPortal(
    <div className={cn(
      'fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border border-slate-200 z-[100] flex flex-col transition-all duration-300 w-[360px]',
      isUploadModalOpen ? 'h-auto max-h-[400px]' : 'h-10'
    )}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-primary/15 text-primary rounded-t-lg cursor-pointer"
        onClick={() => setIsUploadModalOpen(!isUploadModalOpen)}
      >
        <span className="text-[11px] font-medium flex items-center gap-1.5">
          {isActive && (
            <CoffeeIcon ref={coffeeIconRef} size={13} className="text-primary flex-shrink-0" />
          )}
          {isUploadInitiating
            ? 'Preparing upload…'
            : isUploading
              ? `Uploading ${completedCount}/${uploadQueue.length}`
              : `Uploads complete ${completedCount}/${uploadQueue.length}`
          }
        </span>
        <div className="flex items-center gap-2 text-primary/60">
          {isUploadModalOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {!isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); dismiss() }}
              className="hover:bg-black/10 rounded p-0.5 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chrome-style indeterminate loading bar */}
      {isActive && (
        <div className="relative h-1 w-full overflow-hidden bg-primary/15">
          <div
            className="absolute inset-y-0 w-1/2 animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full"
            style={{ backgroundColor: branding?.secondaryColor ?? 'hsl(var(--primary))' }}
          />
        </div>
      )}

      {/* Body */}
      {isUploadModalOpen && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-0 custom-scrollbar">
          {/* Skeleton while preparing folder upload */}
          {isUploadInitiating && uploadQueue.length === 0 && (
            <div className="flex flex-col gap-2 px-3 py-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2 animate-pulse">
                  <div className="h-3.5 w-3.5 rounded bg-slate-200 flex-shrink-0" />
                  <div className="h-2.5 rounded bg-slate-200" style={{ width: `${55 + i * 13}%` }} />
                </div>
              ))}
            </div>
          )}

          {uploadQueue.map((item) => (
            <div
              key={item.id}
              data-uploading={item.status === 'uploading' ? 'true' : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 min-h-[32px] border-b border-slate-100 last:border-0 hover:bg-slate-50 group transition-opacity duration-300",
                item.status === 'pending' && "opacity-40"
              )}
            >
              <div className="flex-shrink-0">
                <DocumentIcon mimeType={item.file.type} className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[11px] text-slate-700 truncate", item.status === 'uploading' ? "font-bold" : "font-medium")} title={item.finalName || item.file.name}>
                  {item.finalName || item.file.name}
                </p>
                {item.status === 'error' && (
                  <p className="text-[10px] text-red-500 truncate">{item.error || 'Upload failed'}</p>
                )}
              </div>
              {/* Right-side icons — all constrained to h-3.5 w-3.5 to prevent row height shifts */}
              <div className="flex-shrink-0 flex items-center gap-1.5">
                {onShowFileLocation && (item.status === 'completed' || item.status === 'uploading') && (
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => { e.stopPropagation(); onShowFileLocation(item.finalName || item.file.name) }}
                          className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-slate-100 rounded text-slate-500 transition-opacity flex-shrink-0"
                        >
                          <Folder className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p>Show file location</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <span className="h-3.5 w-3.5 flex-shrink-0 flex items-center justify-center">
                  {item.status === 'pending' && <Clock className="h-3.5 w-3.5 text-slate-400" />}
                  {item.status === 'uploading' && <UploadSpinner />}
                  {item.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                  {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
