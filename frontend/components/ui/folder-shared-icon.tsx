'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const SIZE_PX = 16

/**
 * Reusable shared-folder icon (Material-style folder with people).
 * Matches the size of the regular folder icon (h-4 w-4 = 16px).
 *
 * @param fillLevel 0 = outline, 0.5 = contains shared items, 1 = shared folder
 * @param tooltip 'shared' | 'contains-shared' | string. When set, wraps icon in Tooltip.
 */
export function SharedFolderIcon({
  fillLevel = 0,
  size = SIZE_PX,
  className,
  tooltip,
}: {
  fillLevel?: 0 | 0.5 | 1
  size?: number
  className?: string
  /** 'shared' => "Shared folder", 'contains-shared' => "Contains shared items", or custom string */
  tooltip?: 'shared' | 'contains-shared' | string
}) {
  const fillOpacity = fillLevel === 1 ? 1 : fillLevel === 0.5 ? 0.5 : 0.2
  const tooltipText =
    tooltip === 'shared'
      ? 'Shared folder'
      : tooltip === 'contains-shared'
        ? 'Contains shared items'
        : tooltip

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('flex-shrink-0 block', className)}
      style={{ color: '#5A78FF' }}
      aria-hidden
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-5 3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 8h-8v-1c0-1.33 2.67-2 4-2s4 .67 4 2v1z"
        fill="currentColor"
        fillOpacity={fillOpacity}
      />
    </svg>
  )

  if (tooltipText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center w-4 h-4">{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipText}</TooltipContent>
      </Tooltip>
    )
  }

  return <span className="inline-flex items-center justify-center w-4 h-4">{icon}</span>
}
