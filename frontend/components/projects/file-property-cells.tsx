'use client'

import React from 'react'
import { DateProperty, PersonProperty, READ_ONLY_PILL_CLASS, StatusProperty, type PersonOption } from '@/components/ui/property-cells'
import { saveAssignee } from '@/components/files/save-assignee'
import { StatusPill } from '@/components/ui/status-pill'
import { getAllowedTransitions, type EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { statusOf } from '@/lib/ui/status'
import { ACTIVITY_STAGES, type ActivityStatus } from '@/lib/sharing-settings'
import { Hint } from '@/components/ui/tooltip'
import { stageDoneTitle, stageFailureTitle, useStageMove } from '@/components/files/use-stage-move'
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
        // Inset as the editable picker's button is (StatusProperty), so read-only and editable values line up.
        if (!value) return <span className={cn(READ_ONLY_PILL_CLASS, 'text-[0.8125rem]', emptyClassName)}>{emptyLabel}</span>
        return isFolder
            ? <Hint label="Follows its documents"><span className={READ_ONLY_PILL_CLASS}><StatusPill kind="deliverable" status={value} /></span></Hint>
            : <span className={READ_ONLY_PILL_CLASS}><StatusPill kind="deliverable" status={value} /></span>
    }
    return (
        <>
            <StatusProperty
                kind="deliverable"
                value={value}
                placeholder={emptyLabel}
                failTitle="Couldn't change the stage"
                options={ACTIVITY_STAGES.filter((s) => s === value || allowed.includes(s))}
                onChange={async (next) => {
                    const stage = next as ActivityStatus
                    const result = await move(projectId, documentId, stage)
                    if (!result.ok) {
                        if (!result.cancelled) onAddToast({ type: 'error', title: stageFailureTitle(result, stage), message: result.error })
                        return
                    }
                    setValue(stage)
                    onSaved(stage)
                    if (result.deliverable) onDeliverableChanged?.(result.deliverable)
                    // Moved, but part of it couldn't be done (its deliverable stayed, storage refused part of an approval).
                    onAddToast(result.warning
                        ? { type: 'warning', title: stageDoneTitle(stage), message: result.warning }
                        : { type: 'success', title: stageDoneTitle(stage), message: `${fileName} · ${statusOf('deliverable', stage).label}` })
                    window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
                }}
            />
            {dialog}
        </>
    )
}

/** The Files row's Assignee cell: leads pick someone in place, everyone else reads who it is. */
export function FileAssigneeCell({
    projectId,
    documentId,
    assignee,
    people,
    canEdit,
    placeholder,
    meEmail,
    onSaved,
    onError,
}: {
    projectId: string
    documentId: string
    assignee: PersonOption | null
    /** Who may be assigned: the firm's own members, as on a deliverable. */
    people: PersonOption[]
    canEdit: boolean
    /** What an empty cell reads: "Not set" for a deliverable or what's inside one, otherwise a dash. */
    placeholder: string
    /** The viewer's email: their own row reads "me". */
    meEmail?: string
    onSaved: (next: PersonOption | null) => void
    onError: (message: string) => void
}) {
    const [value, setValue] = React.useState<PersonOption | null>(assignee)
    React.useEffect(() => { setValue(assignee) }, [assignee])
    const isMe = !!value?.email && !!meEmail && value.email.toLowerCase() === meEmail.toLowerCase()
    return (
        <PersonProperty
            value={value && isMe ? { ...value, shownAs: 'me' } : value}
            people={people}
            disabled={!canEdit}
            placeholder={placeholder}
            failTitle="Couldn't change the assignee"
            onChange={async (next) => {
                const result = await saveAssignee(projectId, documentId, next?.id ?? null)
                if (!result.ok) {
                    onError(result.error)
                    return
                }
                setValue(next)
                onSaved(next)
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
    onWarning,
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
    /** Saved, but its reminders or notices couldn't all follow ("done, but…"): a warning, not an error. */
    onWarning: (message: string) => void
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
            failTitle="Couldn't set due date"
            onChange={async (next) => {
                const result = await save(projectId, documentId, next)
                if (!result.ok) {
                    if (result.cancelled) return
                    onError(result.error)
                    // The engagement's date moved and couldn't be put back: show it as it is.
                    if (result.engagementDueDate) onOthersChanged?.()
                    return
                }
                setValue(result.dueDate)
                onSaved(result.dueDate)
                if (result.warning) onWarning(result.warning)
                if (result.alsoChanged.length > 0 || result.engagementDueDate) onOthersChanged?.()
                window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
            }}
        />
        {dialog}
        </>
    )
}
