'use client'

import { Folder } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocumentBreadcrumbProps {
  parentName?: string | null
  parentId?: string | null
  /** When provided with a parentId, renders as a clickable button that navigates to the parent folder. */
  onFolderClick?: (parentId: string, parentName: string) => void
  className?: string
  /** Icon size class. Defaults to h-3 w-3. */
  iconSize?: string
  /** Text size class. Defaults to text-[10px]. */
  textSize?: string
  /** Shown as a non-clickable placeholder when parentName is null/undefined. */
  fallback?: string
}

export function DocumentBreadcrumb({
  parentName,
  parentId,
  onFolderClick,
  className,
  iconSize = 'h-3 w-3',
  textSize = 'text-[10px]',
  fallback,
}: DocumentBreadcrumbProps) {
  if (!parentName) {
    if (!fallback) return null
    return (
      <div className={cn('flex items-center gap-1 min-w-0 mt-0.5', className)}>
        <Folder className={cn(iconSize, 'shrink-0 stroke-slate-300 stroke-[1.5] fill-slate-100')} aria-hidden />
        <span className={cn(textSize, 'text-slate-400 truncate italic')}>{fallback}</span>
      </div>
    )
  }

  const isClickable = !!(onFolderClick && parentId)

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onFolderClick!(parentId!, parentName)
        }}
        title={`${parentName} (open in Files)`}
        className={cn('flex items-center gap-1 min-w-0 mt-0.5 group/bc', className)}
      >
        <Folder
          className={cn(iconSize, 'shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200 group-hover/bc:stroke-primary group-hover/bc:fill-primary/20 transition-colors')}
          aria-hidden
        />
        <span className={cn(textSize, 'text-slate-500 truncate group-hover/bc:text-primary group-hover/bc:underline transition-colors')}>
          {parentName}
        </span>
      </button>
    )
  }

  return (
    <div className={cn('flex items-center gap-1 min-w-0 mt-0.5', className)}>
      <Folder className={cn(iconSize, 'shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200')} aria-hidden />
      <span className={cn(textSize, 'text-slate-500 truncate')}>{parentName}</span>
    </div>
  )
}
