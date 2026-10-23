'use client'

import React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Icon element rendered inside the icon pill */
  icon: React.ReactNode
  /** Icon pill color variant */
  iconVariant?: 'red' | 'amber' | 'primary'
  /** Sentence-case title beside the icon; also the dialog's accessible name */
  title: string
  /** Short subtitle shown below the title in the header */
  subtitle?: string
  /** Body description — filename / entity name should be pre-formatted by the caller */
  description: React.ReactNode
  /** Optional extra content rendered below the description (e.g. a warning banner) */
  extra?: React.ReactNode
  cancelLabel?: string
  confirmLabel?: string
  /** Confirm button color variant */
  confirmVariant?: 'red' | 'primary' | 'amber'
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
  /** When true, only the cancel button is shown (use for warning-only dialogs) */
  hideConfirm?: boolean
}

/** Icon tile tint per variant: Notion tag colors for warnings, neutral for everything else. */
const ICON_TILE: Record<string, string> = {
  red:     'bg-tag-red-bg text-tag-red-fg',
  amber:   'bg-tag-yellow-bg text-tag-yellow-fg',
  primary: 'bg-surface-muted text-fg-muted',
}

/**
 * Linear-style confirmation (.claude/plans/ui-ux-overhaul.md, Phase 6): an icon tile, a sentence-case
 * title and subtitle, the consequence in plain text, and the two buttons bottom-right — no header
 * strip, no tinted body, no uppercase. A hairline under the title row and over the buttons (as in the
 * Files organize dialogs, 2026-10-23) keeps the three apart.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  icon,
  iconVariant = 'red',
  title,
  subtitle,
  description,
  extra,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  confirmVariant = 'red',
  onCancel,
  onConfirm,
  loading = false,
  hideConfirm = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-sm">
        <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-5 pr-10">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control [&_svg]:h-4 [&_svg]:w-4 ${ICON_TILE[iconVariant]}`}>
            {icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle className="text-ui font-semibold leading-tight text-fg">{title}</DialogTitle>
            {subtitle && <p className="mt-0.5 text-small text-fg-muted">{subtitle}</p>}
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 pl-16">
          <div className="text-small leading-relaxed text-fg-muted">{description}</div>
          {extra}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          {!hideConfirm && confirmLabel && (
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={loading}
              variant={confirmVariant === 'red' ? 'destructive' : 'default'}
              className={cn('min-w-[5.5rem]', confirmVariant === 'amber' && 'bg-tag-orange-fg text-white hover:bg-tag-orange-fg hover:opacity-90')}
            >
              {loading ? <LoadingSpinner size="sm" /> : confirmLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
