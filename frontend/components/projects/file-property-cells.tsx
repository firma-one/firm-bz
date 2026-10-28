'use client'

import React from 'react'
import { DateProperty, StatusProperty } from '@/components/ui/property-cells'
import { StatusPill } from '@/components/ui/status-pill'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { statusOf } from '@/lib/ui/status'
import type { ActivityStatus } from '@/lib/sharing-settings'
import { cn } from '@/lib/utils'

/*
 * A document's Status and Due editors: the Files row's cells, and the Details pane's Info tab
 * (components/files/asset-details-pane.tsx). Moved out of engagement-file-row.tsx so both use one.
 */

const STAGES: ActivityStatus[] = ['to_do', 'in_progress', 'in_review', 'approved']

/**
 * The Status cell. Read-only unless the viewer may move this row; then a picker offering only the
 * stages their role allows from here (getAllowedTransitions, as the Board and the server use). A
 * deliverable can't be approved while a document inside it isn't — the Board's rule, checked first.
 */
export function FileStatusCell({
    projectId,
    documentId,
    fileName,
    isFolder,
    status,
    roleSlug,
    emptyLabel,
    emptyClassName,
    onSaved,
    onAddToast,
}: {
    projectId: string
    documentId: string
    fileName: string
    isFolder: boolean
    status: ActivityStatus | null
    /** null when the row can't be changed here. */
    roleSlug: EngagementRoleSlug | null
    emptyLabel: string
    emptyClassName: string
    onSaved: (next: ActivityStatus) => void
    onAddToast: (toast: { type: string; title: string; message: string }) => void
}) {
    const [value, setValue] = React.useState<ActivityStatus | null>(status)
    React.useEffect(() => { setValue(status) }, [status])
    // A document with no stage yet is at "to do" as far as the rules go.
    const allowed = roleSlug ? getAllowedTransitions(roleSlug, value ?? 'to_do') : []
    if (allowed.length === 0) {
        return value
            ? <StatusPill kind="deliverable" status={value} />
            : <span className={cn('text-[0.8125rem]', emptyClassName)}>{emptyLabel}</span>
    }
    return (
        <StatusProperty
            kind="deliverable"
            value={value}
            placeholder={emptyLabel}
            options={STAGES.filter((s) => s === value || allowed.includes(s))}
            onChange={async (next) => {
                const stage = next as ActivityStatus
                const { getSession } = await import('@/lib/supabase')
                const session = await getSession()
                const headers = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
                if (stage === 'approved' && isFolder) {
                    const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/subtasks`, { headers })
                    const data = await res.json().catch(() => ({}))
                    const unapproved = ((data.subtasks ?? []) as { status: string | null }[]).filter((t) => t.status !== 'approved').length
                    if (!res.ok || unapproved > 0) {
                        onAddToast({
                            type: 'error',
                            title: 'Cannot approve yet',
                            message: res.ok
                                ? `${unapproved} document${unapproved > 1 ? 's' : ''} still need to be approved before this deliverable can be approved.`
                                : 'Could not check the documents inside it. Please try again.',
                        })
                        return
                    }
                }
                const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing/activity`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ status: stage }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    onAddToast({ type: 'error', title: "Couldn't change the stage", message: err.error ?? 'Please try again.' })
                    return
                }
                setValue(stage)
                onSaved(stage)
                onAddToast({
                    type: 'success',
                    title: stage === 'approved' ? 'Approved' : 'Stage updated',
                    message: `${fileName} · ${statusOf('deliverable', stage).label}`,
                })
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
    )
}

/** Inline Due editor for one file or deliverable folder — the same endpoint the row menu's "Due" uses. */
export function FileDueDateCell({
    projectId,
    documentId,
    dueDate,
    placeholder,
    onSaved,
    onError,
    asProperty = false,
}: {
    projectId: string
    documentId: string
    dueDate: string | null
    /** What an empty cell reads: "Not set" for a deliverable or what's inside one, otherwise a dash. */
    placeholder: string
    onSaved: (next: string | null) => void
    onError: (message: string) => void
    /** In a property list (the Details pane) rather than a table cell: full size, no chip. */
    asProperty?: boolean
}) {
    const [value, setValue] = React.useState<string | null>(dueDate)
    React.useEffect(() => { setValue(dueDate) }, [dueDate])
    return (
        <DateProperty
            value={value}
            placeholder={placeholder}
            highlightOverdue
            allowTime
            compact={!asProperty}
            chip={!asProperty}
            onChange={async (next) => {
                const { getSession } = await import('@/lib/supabase')
                const session = await getSession()
                const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/due-date`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                    body: JSON.stringify({ dueDate: next }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    onError(err.error ?? 'Failed to update due date')
                    return
                }
                setValue(next)
                onSaved(next)
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
    )
}
