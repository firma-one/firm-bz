'use client'

import React from 'react'
import { DateProperty, StatusProperty } from '@/components/ui/property-cells'
import { StatusPill } from '@/components/ui/status-pill'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { statusOf } from '@/lib/ui/status'
import { ACTIVITY_STAGES, type ActivityStatus } from '@/lib/sharing-settings'
import { Hint } from '@/components/ui/tooltip'
import { useStageMove } from '@/components/files/use-stage-move'
import { useDueDateSave } from '@/components/files/use-due-date-save'
import { cn } from '@/lib/utils'

/*
 * A document's Status and Due editors: the Files row's cells, and the Details pane's Info tab
 * (components/files/asset-details-pane.tsx). Moved out of engagement-file-row.tsx so both use one.
 */

/**
 * The Status cell. A deliverable's stage follows its documents, so it only ever reads (with why, on
 * hover). A document's is read-only unless the viewer may move it; then a picker offering only the
 * stages their role allows from here (getAllowedTransitions, as the server uses). A move that takes
 * its deliverable to the client or approves it asks first (useStageMove).
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
    onDeliverableChanged,
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
    /** The document's deliverable moved with it. */
    onDeliverableChanged?: (deliverable: { id: string; status: ActivityStatus }) => void
    onAddToast: (toast: { type: string; title: string; message: string }) => void
}) {
    const [value, setValue] = React.useState<ActivityStatus | null>(status)
    React.useEffect(() => { setValue(status) }, [status])
    const { move, dialog } = useStageMove()
    const allowed = roleSlug && !isFolder && value ? getAllowedTransitions(roleSlug, value) : []
    if (allowed.length === 0) {
        if (!value) return <span className={cn('text-[0.8125rem]', emptyClassName)}>{emptyLabel}</span>
        return isFolder
            ? <Hint label="Follows its documents"><span className="inline-flex"><StatusPill kind="deliverable" status={value} /></span></Hint>
            : <StatusPill kind="deliverable" status={value} />
    }
    return (
        <>
            <StatusProperty
                kind="deliverable"
                value={value}
                placeholder={emptyLabel}
                options={ACTIVITY_STAGES.filter((s) => s === value || allowed.includes(s))}
                onChange={async (next) => {
                    const stage = next as ActivityStatus
                    const result = await move(projectId, documentId, stage)
                    if (!result.ok) {
                        if (!result.cancelled) onAddToast({ type: 'error', title: "Couldn't change the stage", message: result.error })
                        return
                    }
                    setValue(stage)
                    onSaved(stage)
                    if (result.deliverable) onDeliverableChanged?.(result.deliverable)
                    onAddToast({
                        type: 'success',
                        title: stage === 'approved' ? 'Approved' : 'Stage updated',
                        message: `${fileName} · ${statusOf('deliverable', stage).label}`,
                    })
                    window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
                }}
            />
            {dialog}
        </>
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
    onOthersChanged,
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
    /** A fix chosen in the due-date dialog moved another date too (its deliverable, its documents, the engagement). */
    onOthersChanged?: () => void
}) {
    const [value, setValue] = React.useState<string | null>(dueDate)
    React.useEffect(() => { setValue(dueDate) }, [dueDate])
    // Due dates nest: a change that breaks that asks, with the fixes (lib/files/due-date-rule.ts).
    const { save, dialog } = useDueDateSave()
    return (
        <>
        <DateProperty
            value={value}
            placeholder={placeholder}
            highlightOverdue
            allowTime
            compact={!asProperty}
            chip={!asProperty}
            onChange={async (next) => {
                const result = await save(projectId, documentId, next)
                if (!result.ok) {
                    if (!result.cancelled) onError(result.error)
                    return
                }
                setValue(result.dueDate)
                onSaved(result.dueDate)
                if (result.alsoChanged.length > 0 || result.engagementDueDate) onOthersChanged?.()
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
        {dialog}
        </>
    )
}
