'use client'

import React from 'react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Icon element rendered inside the icon pill */
  icon: React.ReactNode
  /** Icon pill colour variant */
  iconVariant?: 'red' | 'amber' | 'primary'
  /** Title shown in the white header strip (rendered uppercase via CSS) */
  title: string
  /** Short subtitle shown below the title in the header */
  subtitle?: string
  /** Body description — filename / entity name should be pre-formatted by the caller */
  description: React.ReactNode
  /** Optional extra content rendered below the description (e.g. a warning banner) */
  extra?: React.ReactNode
  cancelLabel?: string
  confirmLabel?: string
  /** Confirm button colour variant */
  confirmVariant?: 'red' | 'primary' | 'amber'
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
  /** When true, only the cancel button is shown (use for warning-only dialogs) */
  hideConfirm?: boolean
}

const ICON_PILL: Record<string, string> = {
  red:     'bg-red-50 ring-1 ring-red-200',
  amber:   'bg-amber-50 ring-1 ring-amber-200',
  primary: 'bg-primary/10 ring-1 ring-primary/20',
}

const ICON_COLOR: Record<string, string> = {
  red:     'text-red-500',
  amber:   'text-amber-500',
  primary: 'text-primary',
}

const CONFIRM_BTN: Record<string, string> = {
  red:     'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  amber:   'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
  primary: 'bg-primary hover:brightness-105 text-white shadow-sm',
}

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
      <DialogContent className="sm:max-w-sm border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb]">
        <VisuallyHidden><DialogTitle>{title}</DialogTitle></VisuallyHidden>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
          <div className={`mt-0.5 h-7 w-7 rounded flex items-center justify-center shrink-0 ${ICON_PILL[iconVariant]}`}>
            <span className={ICON_COLOR[iconVariant]}>{icon}</span>
          </div>
          <div>
            <p className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-[#45474c] mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-[#45474c] leading-relaxed">{description}</p>
          {extra}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="rounded text-[10px] font-headline font-bold tracking-widest uppercase border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
          >
            {cancelLabel}
          </Button>
          {!hideConfirm && confirmLabel && (
            <Button
              onClick={onConfirm}
              disabled={loading}
              className={`rounded text-[10px] font-headline font-bold tracking-widest uppercase ${CONFIRM_BTN[confirmVariant]}`}
            >
              {loading ? <svg className="h-3 w-3 animate-spin text-white/80" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg> : confirmLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
