'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

/*
 * Shared frame for the "New firm / client / engagement" dialogs (.claude/plans/ui-ux-overhaul.md,
 * Phase 6). The body is property rows (PropertyList/PropertyRow with PROPERTY_FIELD_CLASS), exactly
 * like the engagement, client and firm settings forms, so creating and editing look the same.
 */

/** Sentence-case title and one line of context — the visible dialog title, no icon tile or strip. */
export function CreateDialogHeader({ title, description }: { title: string; description?: ReactNode }) {
    return (
        <div className="px-5 pb-2 pt-5 pr-12">
            <DialogTitle className="text-h3 text-fg">{title}</DialogTitle>
            {description && <DialogDescription className="mt-0.5 text-small text-fg-muted">{description}</DialogDescription>}
        </div>
    )
}

/** A failure or plan-limit notice above the properties. "Upgrade" in a limit message links to billing. */
export function CreateDialogNotice({ message, limit = false }: { message: string; limit?: boolean }) {
    const [before, after] = limit ? message.split('Upgrade') : [message, undefined]
    return (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-tag-red-bg px-3 py-2 text-small text-tag-red-fg">
            {limit && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>
                {before}
                {after !== undefined && (
                    <>
                        <Link href="/d/billing" className="font-medium underline underline-offset-2">Upgrade</Link>
                        {after}
                    </>
                )}
            </span>
        </div>
    )
}

/** Cancel and the primary action, bottom-right under a hairline; sticks to the bottom when the body scrolls. */
export function CreateDialogFooter({
    onCancel,
    cancelDisabled,
    submitDisabled,
    submitting,
    submitLabel = 'Create',
}: {
    onCancel: () => void
    cancelDisabled?: boolean
    submitDisabled?: boolean
    submitting?: boolean
    submitLabel?: string
}) {
    return (
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={cancelDisabled}>
                Cancel
            </Button>
            <Button type="submit" variant="greenCta" size="sm" disabled={submitDisabled} className="min-w-[5.5rem]">
                {submitting ? <LoadingSpinner size="sm" /> : submitLabel}
            </Button>
        </div>
    )
}
