"use client"

import { isValidElement, useEffect, useRef, useState } from "react"
import { Activity as ActivityIcon, Ban, CalendarClock, Check, CheckCircle2, CircleDot, FilePlus2, FilePen, FileType, History, Info, Loader2, MessagesSquare, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentIcon } from "@/components/ui/document-icon"
import { PropertyList, PropertyRow } from "@/components/ui/property-list"
import { PersonAvatar, PersonProperty, type PersonOption } from "@/components/ui/property-cells"
import { saveAssignee } from "@/components/files/save-assignee"
import { InfoHint } from "@/components/projects/overview-charts"
import { Brio } from "@/components/ui/brio"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { DocumentDiscussionTab } from "@/components/files/document-discussion-tab"
import { FileDueDateCell, FileStatusCell } from "@/components/projects/file-property-cells"
import { BlockedProperty } from "@/components/files/blocked-property"
import { MissingDueWarning } from "@/components/files/missing-due-warning"
import { needsDueDate } from "@/lib/ui/due-date"
import { approvalsOf, approvalVersionName, type ApprovalRecord } from "@/lib/files/approvals"
import { Tag } from "@/components/ui/tag"
import { DocumentVersionsTimeline } from "@/components/files/document-versions-timeline"
import { DocumentActivityFeed } from "@/components/files/document-activity-feed"
import { cn, formatFileSize, formatFullDate, formatSmartDateTime, getFileTypeLabel } from "@/lib/utils"
import { LoadFailed } from "@/components/ui/load-failed"
import { failureFrom, failureReason } from "@/lib/files/action-failure"
import type { useRightPane } from "@/lib/right-pane-context"
import type { EngagementRoleSlug } from "@/lib/deliverable-stage-roles"
import type { ActivityStatus } from "@/lib/sharing-settings"

/**
 * A document's Details in one right pane, laid out as the Board's pane lays out a deliverable
 * (components/projects/shares/deliverable-detail-panel.tsx): the shared fields first — Status,
 * Assignee, Due, Created, Modified, Type — then tabs for Details (the description), Discussions (the
 * deliverable's thread, about this file), Versions and Activity (.claude/plans/engagement-assets-details.md, Phase 2). Opened from the
 * document menu's Details item and from the row's Details icon.
 */

export type AssetDetailsTab = 'details' | 'versions' | 'activity' | 'discussions'

const TAB_META: Record<AssetDetailsTab, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    details: { label: 'Details', icon: Info },
    versions: { label: 'Versions', icon: History },
    activity: { label: 'Activity', icon: ActivityIcon },
    // The engagement's own page for comment threads is Discussions; the tab is the same thing for one file.
    discussions: { label: 'Discussions', icon: MessagesSquare },
}

/**
 * Which tabs a viewer gets. Versions and Activity read the provider's version list and the audit
 * log, both internal-only (the versions route refuses external roles). A link has no versions.
 * Without the engagement there is nothing to load beyond Details.
 */
export function assetDetailsTabs({ isExternalUser, isLink, hasProject }: { isExternalUser: boolean; isLink: boolean; hasProject: boolean }): AssetDetailsTab[] {
    const tabs: AssetDetailsTab[] = ['details']
    if (hasProject) tabs.push('discussions')
    if (hasProject && !isExternalUser && !isLink) tabs.push('versions')
    if (hasProject && !isExternalUser) tabs.push('activity')
    return tabs
}

/**
 * What the viewer may change in the fields and Details, as the Files row decides it for its own
 * cells. Without it
 * (the pane opened outside the Files list) every field reads only.
 */
export interface AssetDetailsEditing {
    /** The viewer's role when they may move this file's stage here; null when the stage reads only. */
    statusRole: EngagementRoleSlug | null
    /** A deliverable or a document: the work Status and Due track. A plain folder reads "—". */
    tracked: boolean
    canEditDue: boolean
    /** Engagement leads: the assignee and description routes allow them only. */
    canManage: boolean
    /** The firm's own roles, on a document: they mark it blocked or clear it. */
    canBlock?: boolean
    /** After any change here, so the Files row shows it too. */
    onSaved?: () => void
}

export interface AssetDetailsPaneProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document: any
    projectId?: string
    orgSlug?: string
    isExternalUser?: boolean
    initialTab?: AssetDetailsTab
    editing?: AssetDetailsEditing
}

/** The File information pane's words for a type, where the short list label differs. */
const LONG_TYPE_LABEL: Record<string, string> = { Sheet: 'Spreadsheet', Doc: 'Document' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validDate(value: unknown): value is string {
    return typeof value === 'string' && value !== '' && !Number.isNaN(new Date(value).getTime())
}

async function authHeaders(): Promise<Record<string, string>> {
    const { getSession } = await import('@/lib/supabase')
    const session = await getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

type Member = { userId: string; name: string | null; email: string | null; avatarUrl: string | null; role: string; isAgent?: boolean }

const personOf = (m: Member): PersonOption => ({ id: m.userId, name: m.name ?? m.email ?? 'Member', email: m.email, avatarUrl: m.avatarUrl })

/** Only the firm's own members can be assigned, as on a deliverable. */
export const assignablePeople = (members: Member[]): PersonOption[] =>
    members.filter((m) => !m.isAgent && (m.role === 'eng_admin' || m.role === 'eng_member')).map(personOf)

/** "Who · when" for Created and Modified: either half may be missing. */
function WhoWhen({ name, avatarUrl, at }: { name?: string | null; avatarUrl?: string | null; at?: string }) {
    if (!name && !validDate(at)) return <span className="px-1.5 text-fg-subtle">—</span>
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 px-1.5">
            {name && <PersonAvatar person={{ name, avatarUrl: avatarUrl ?? null }} />}
            {name && <span className="truncate">{name}</span>}
            {name && validDate(at) && <span className="text-fg-subtle">·</span>}
            {validDate(at) && <span className="shrink-0 text-fg-muted">{formatSmartDateTime(at)}</span>}
        </span>
    )
}

/** What the fields and the Details tab load for a document: its assignee and description (in its settings), and the engagement's people. */
interface AssetRecord {
    canLoad: boolean
    /**
     * Loaded, failed (with why), or still loading. Fields edit only once it's loaded: after a failed
     * load the blank description and "No assignee" aren't the file's, and typing would save over
     * the real ones (FI-7).
     */
    state: 'loading' | 'ready' | 'failed'
    error: string | null
    members: Member[]
    assigneeId: string | null
    setAssigneeId: (id: string | null) => void
    description: string
    setDescription: (value: string) => void
    /** The decision record: what was approved, oldest first (lib/files/approvals.ts). */
    approvals: ApprovalRecord[]
    /** Reads the record again, e.g. after approving here. */
    reload: () => void
}

function useAssetRecord(projectId: string | undefined, recordId: string | undefined): AssetRecord {
    const canLoad = !!projectId && !!recordId && UUID.test(recordId)
    const [members, setMembers] = useState<Member[]>([])
    const [assigneeId, setAssigneeId] = useState<string | null>(null)
    const [description, setDescription] = useState('')
    const [approvals, setApprovals] = useState<ApprovalRecord[]>([])
    const [loads, setLoads] = useState(0)
    const [state, setState] = useState<AssetRecord['state']>('loading')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!canLoad) return
        let cancelled = false
        setState('loading')
        setError(null)
        ;(async () => {
            const headers = await authHeaders()
            const [sharingRes, membersRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/documents/${recordId}/sharing`, { headers }),
                fetch(`/api/projects/${projectId}/members`, { headers }),
            ])
            if (cancelled) return
            // Both, or it's a failed load: without the people, a set assignee reads as "No assignee".
            if (!sharingRes.ok) throw await failureFrom(sharingRes)
            if (!membersRes.ok) throw await failureFrom(membersRes)
            const settings = (await sharingRes.json()).sharing?.settings ?? {}
            const data = await membersRes.json()
            if (cancelled) return
            setAssigneeId(typeof settings.assigneeUserId === 'string' ? settings.assigneeUserId : null)
            setDescription(typeof settings.description === 'string' ? settings.description : '')
            setApprovals(approvalsOf(settings))
            setMembers(data.members ?? [])
            setState('ready')
        })().catch((e) => {
            if (cancelled) return
            setError(failureReason(e))
            setState('failed')
        })
        return () => { cancelled = true }
    }, [canLoad, projectId, recordId, loads])

    return { canLoad, state, error, members, assigneeId, setAssigneeId, description, setDescription, approvals, reload: () => setLoads((n) => n + 1) }
}

/** The shared fields at the top of the pane, as the Board's pane lists a deliverable's. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssetFields({ document, projectId, recordId, editing, record }: { document: any; projectId?: string; recordId?: string; editing?: AssetDetailsEditing; record: AssetRecord }) {
    const { addToast } = useToast()
    const { members, assigneeId, setAssigneeId } = record
    const people = assignablePeople(members)
    const assignee = assigneeId ? members.find((m) => m.userId === assigneeId) : undefined
    // Editable only once the record has loaded: never over values it couldn't read.
    const canManage = !!editing?.canManage && record.canLoad && record.state === 'ready'
    const tracked = !!editing?.tracked
    const emptyLabel = tracked ? 'Not set' : '—'
    // From the row's type, not isDeliverable: a folder (a deliverable's stage only reads) or a document.
    const isFolderLike = document.mimeType === 'application/vnd.google-apps.folder' || !!document.isFolder
    // Tracked work with no stage yet, as the Files row shows it: a document is Not started, a deliverable at To do.
    const stage: ActivityStatus | null = document.activityStatus ?? document.deliverableStatus ?? (tracked ? (isFolderLike ? 'to_do' : 'not_started') : null)
    // The due date as it stands here (it can change in this pane), for the underway-with-no-date warning.
    const [dueDate, setDueDate] = useState<string | null>(document.dueDate ?? null)

    const changeAssignee = async (next: PersonOption | null) => {
        const result = await saveAssignee(projectId!, recordId!, next?.id ?? null)
        if (!result.ok) {
            addToast({ type: 'error', title: "Couldn't change the assignee", message: result.error })
            return
        }
        setAssigneeId(next?.id ?? null)
        editing?.onSaved?.()
    }

    const creator = document.creator?.displayName
        ? { name: document.creator.displayName, avatarUrl: document.creator.photoLink }
        : document.owners?.[0]?.displayName
            ? { name: document.owners[0].displayName, avatarUrl: document.owners[0].photoLink }
            : null
    const mimeType: string = (document.mimeType ?? '').trim()
    const typeLabel = getFileTypeLabel(mimeType)
    const size = document.size != null && document.size !== '' && Number.isFinite(Number(document.size)) ? formatFileSize(document.size) : null

    return (
        <PropertyList>
            <PropertyRow label="Status" icon={<CircleDot />}>
                {recordId && projectId ? (
                    <FileStatusCell
                        projectId={projectId}
                        documentId={recordId}
                        fileName={document.name}
                        // A deliverable's stage follows its documents: shown, never set.
                        isFolder={isFolderLike}
                        status={stage}
                        roleSlug={editing?.statusRole ?? null}
                        emptyLabel={emptyLabel}
                        emptyClassName="px-1.5 text-fg-subtle"
                        onSaved={(next) => {
                            document.activityStatus = next
                            editing?.onSaved?.()
                            // Approving adds to the decision record: show it here.
                            if (next === 'approved') record.reload()
                        }}
                        onAddToast={(t) => addToast({ ...t, type: t.type as Parameters<typeof addToast>[0]['type'] })}
                    />
                ) : (
                    <span className="px-1.5 text-fg-subtle">{emptyLabel}</span>
                )}
            </PropertyRow>
            {/* The firm's own: shown when it may be set here, or is set (a client is never sent it) */}
            {!isFolderLike && recordId && projectId && (editing?.canBlock || document.blocked) && (
                <PropertyRow label="Blocked" icon={<Ban />}>
                    <BlockedProperty
                        projectId={projectId}
                        documentId={recordId}
                        value={document.blocked ?? null}
                        canEdit={!!editing?.canBlock && record.canLoad && record.state === 'ready'}
                        onSaved={(next) => {
                            document.blocked = next
                            editing?.onSaved?.()
                        }}
                        onError={(message) => addToast({ type: 'error', title: "Couldn't change the block", message })}
                    />
                </PropertyRow>
            )}
            <PropertyRow label="Assignee" icon={<UserRound />}>
                <PersonProperty
                    value={assignee ? personOf(assignee) : null}
                    people={people}
                    onChange={changeAssignee}
                    disabled={!canManage}
                    // Not "No assignee" for one it couldn't read.
                    placeholder={record.state === 'failed' ? 'Not loaded' : record.state === 'loading' && record.canLoad ? '…' : 'No assignee'}
                />
            </PropertyRow>
            <PropertyRow label="Due" icon={<CalendarClock />}>
                {editing?.canEditDue && projectId && recordId ? (
                    <FileDueDateCell
                        projectId={projectId}
                        documentId={recordId}
                        dueDate={document.dueDate ?? null}
                        placeholder={emptyLabel}
                        asProperty
                        onSaved={(next) => {
                            document.dueDate = next ?? undefined
                            setDueDate(next)
                            editing.onSaved?.()
                        }}
                        onOthersChanged={editing.onSaved}
                        onError={(message) => addToast({ type: 'error', title: "Couldn't set due date", message })}
                        onWarning={(message) => addToast({ type: 'warning', title: 'Due date set', message })}
                    />
                ) : (
                    <span className={cn('px-1.5', !validDate(document.dueDate) && 'text-fg-subtle')}>
                        {validDate(document.dueDate) ? formatFullDate(document.dueDate) : emptyLabel}
                    </span>
                )}
                {/* Underway with nothing to finish by */}
                {tracked && stage && needsDueDate(stage, dueDate) && <MissingDueWarning stage={stage} className="ml-1" />}
            </PropertyRow>
            <PropertyRow label="Created" icon={<FilePlus2 />}>
                <WhoWhen name={creator?.name} avatarUrl={creator?.avatarUrl} at={document.createdTime} />
            </PropertyRow>
            <PropertyRow label="Modified" icon={<FilePen />}>
                <WhoWhen name={document.lastModifyingUser?.displayName} avatarUrl={document.lastModifyingUser?.photoLink} at={document.modifiedTime} />
            </PropertyRow>
            <PropertyRow label="Type" icon={<FileType />}>
                <span className="inline-flex min-w-0 items-center gap-1.5 px-1.5" title={mimeType || undefined}>
                    <span>{document.documentType === 'LINK' ? 'External link' : (LONG_TYPE_LABEL[typeLabel] ?? typeLabel)}</span>
                    {/* Google lists sizes as numbers, OneDrive as strings. */}
                    {size && <><span className="text-fg-subtle">·</span><span className="text-fg-muted">{size}</span></>}
                </span>
            </PropertyRow>
        </PropertyList>
    )
}

/** The Board pane's section label (deliverable-detail-panel.tsx FIELD_LABEL). */
const FIELD_LABEL = 'mb-1.5 flex items-center gap-1.5 text-small font-medium text-fg-muted'

/** What the Description field is for, beside its label. Brio really does read it: lib/ai/files-context.ts. */
export function DescriptionHint() {
    return (
        <InfoHint
            label="About Description"
            text={<>What this file is and what it&apos;s for, in your own words. <Brio /> reads it to understand what the document is about, and Doc Search matches it too.</>}
        />
    )
}

/** The Details tab: the description, as the Board pane's section. The firm's internal notes are in the deliverable's thread. */
function AssetDetailsSections({ projectId, recordId, editing, record }: { projectId?: string; recordId?: string; editing?: AssetDetailsEditing; record: AssetRecord }) {
    const { addToast } = useToast()
    const { description, setDescription } = record
    const canManage = !!editing?.canManage && record.canLoad && record.state === 'ready'
    // Saved as you type, so the label says where that stands: saving, then saved for a moment.
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
    const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (descriptionTimer.current) clearTimeout(descriptionTimer.current)
        if (savedTimer.current) clearTimeout(savedTimer.current)
    }, [])

    // A moment after you stop typing — the Board pane's description works the same way.
    const changeDescription = (value: string) => {
        setDescription(value)
        if (descriptionTimer.current) clearTimeout(descriptionTimer.current)
        if (savedTimer.current) clearTimeout(savedTimer.current)
        descriptionTimer.current = setTimeout(async () => {
            setSaveState('saving')
            try {
                const res = await fetch(`/api/projects/${projectId}/documents/${recordId}/sharing`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                    body: JSON.stringify({ description: value }),
                })
                if (!res.ok) throw await failureFrom(res)
                setSaveState('saved')
                savedTimer.current = setTimeout(() => setSaveState('idle'), 2000)
            } catch (e) {
                setSaveState('failed')
                addToast({ type: 'error', title: "Couldn't save the description", message: failureReason(e) })
            }
        }, 800)
    }

    return (
        <div className="divide-y divide-line">
            {record.state === 'failed' && (
                <LoadFailed compact what="this file's details" reason={record.error} onRetry={record.reload} className="px-4 py-4" />
            )}
            {record.state !== 'failed' && <div className="px-4 py-4">
                <div className={FIELD_LABEL}>
                    Description
                    <DescriptionHint />
                    <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-caption font-normal">
                        {saveState === 'saving' && <><Loader2 className="h-2.5 w-2.5 animate-spin text-fg-subtle" /><span className="text-fg-subtle">Saving…</span></>}
                        {saveState === 'saved' && <><Check className="h-3 w-3 text-action" /><span className="text-fg-subtle">Saved</span></>}
                        {saveState === 'failed' && <span className="text-danger">Not saved</span>}
                    </span>
                </div>
                {canManage ? (
                    <Textarea
                        value={description}
                        onChange={(e) => changeDescription(e.target.value)}
                        placeholder="What is this file for?"
                        className="-mx-2 min-h-[72px] w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 py-1.5 text-ui shadow-none hover:bg-surface-hover focus-visible:bg-surface"
                    />
                ) : (
                    <p className={cn('whitespace-pre-wrap text-ui leading-relaxed', description ? 'text-fg' : 'text-fg-subtle')}>
                        {description || (record.state === 'loading' && record.canLoad ? '…' : 'No description')}
                    </p>
                )}
            </div>}

            {/* The decision record: every approval, newest first, reopened ones too */}
            {record.approvals.length > 0 && (
                <div className="px-4 py-4">
                    <div className={FIELD_LABEL}>Approvals</div>
                    <ApprovalList approvals={record.approvals} members={record.members} />
                </div>
            )}

        </div>
    )
}

/**
 * What was approved, newest first: the version as its storage names it, who approved it and when,
 * and when it was reopened for further edits. The Archive copy isn't offered yet: a download
 * option comes later (.claude/plans/document-approval-record.md).
 */
export function ApprovalList({ approvals, members }: { approvals: ApprovalRecord[]; members: Member[] }) {
    const nameOf = (userId: string | undefined) => {
        const m = userId ? members.find((x) => x.userId === userId) : undefined
        return m?.name ?? m?.email ?? null
    }
    return (
        <ol className="space-y-2">
            {[...approvals].reverse().map((r) => {
                const by = nameOf(r.approvedBy)
                const reopenedBy = nameOf(r.unlockedBy)
                return (
                    <li key={r.id} className="flex items-start gap-2">
                        <CheckCircle2 className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', r.unlockedAt ? 'text-fg-subtle' : 'text-action')} aria-hidden />
                        <div className="min-w-0">
                            <p className="text-ui text-fg">
                                {approvalVersionName(r)}
                                {!r.unlockedAt && <Tag color="green" className="ml-2">Approved</Tag>}
                            </p>
                            <p className="text-caption text-fg-muted">
                                Approved {formatFullDate(r.approvedAt)}{by ? ` by ${by}` : ''}
                                {r.unlockedAt && <> · reopened {formatFullDate(r.unlockedAt)}{reopenedBy ? ` by ${reopenedBy}` : ''}</>}
                            </p>
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

export function AssetDetailsPane({ document, projectId, orgSlug, isExternalUser = false, initialTab = 'details', editing }: AssetDetailsPaneProps) {
    const isLink = document.documentType === 'LINK'
    const tabs = assetDetailsTabs({ isExternalUser, isLink, hasProject: !!projectId })
    const [tab, setTab] = useState<AssetDetailsTab>(tabs.includes(initialTab) ? initialTab : 'details')
    // Comments, settings and audit events are keyed by the document's own row; the versions route takes either id.
    const recordId: string | undefined = document.projectDocumentId || document.id
    const record = useAssetRecord(projectId, recordId)
    // External users read the fields; they never edit here.
    const viewerEditing = isExternalUser ? undefined : editing

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="shrink-0 px-4 py-2">
                <AssetFields document={document} projectId={projectId} recordId={recordId} editing={viewerEditing} record={record} />
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as AssetDetailsTab)} className="flex min-h-0 flex-1 flex-col">
                {/* The Board pane's tab bar: icon and label, an underline on the open one. */}
                <TabsList className="flex w-full shrink-0 gap-4 px-4">
                    {tabs.map((t) => {
                        const { label, icon: Icon } = TAB_META[t]
                        return (
                            <TabsTrigger key={t} value={t} className="h-9 gap-1.5 px-0 py-0 pb-0 pt-0 text-small font-normal">
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </TabsTrigger>
                        )
                    })}
                </TabsList>

                <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                    <AssetDetailsSections projectId={projectId} recordId={recordId} editing={viewerEditing} record={record} />
                </TabsContent>

                {projectId && tabs.includes('versions') && (
                    <TabsContent value="versions" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                        <DocumentVersionsTimeline document={document} projectId={projectId} approvals={record.approvals} />
                    </TabsContent>
                )}

                {projectId && tabs.includes('activity') && (
                    <TabsContent value="activity" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                        <DocumentActivityFeed
                            projectDocumentId={recordId}
                            documentId={document.id}
                            projectId={projectId}
                            isLink={isLink}
                        />
                    </TabsContent>
                )}

                {projectId && recordId && tabs.includes('discussions') && (
                    <TabsContent value="discussions" className="mt-0 min-h-0 flex-1 overflow-hidden">
                        {/* The deliverable's thread, about this file: discussion happens on deliverables. */}
                        <DocumentDiscussionTab
                            projectId={projectId}
                            documentId={recordId}
                            docId={document.docId}
                            orgSlug={orgSlug}
                            isExternalUser={isExternalUser}
                        />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}

/** Whether the right pane is showing a document's Details — the Files list keeps that row highlighted. */
export function isAssetDetailsPaneContent(content: React.ReactNode): boolean {
    return isValidElement(content) && content.type === AssetDetailsPane
}

/** Opens a document's Details in the right pane, the same from the menu and from the row icon. */
export function openAssetDetailsPane(rightPane: ReturnType<typeof useRightPane>, props: AssetDetailsPaneProps) {
    // Named as the Board's pane names a deliverable: the doc ID ("QSR-16") as the title and the name
    // beneath it, by its type's icon. A file without an ID yet is titled by its name alone.
    const { docId, name, mimeType } = props.document
    rightPane.setTitle(docId || name)
    rightPane.setHeaderIcon(<DocumentIcon mimeType={mimeType} className="h-3.5 w-3.5" />)
    rightPane.setHeaderSubtitle(docId ? name : '')
    rightPane.setHeaderActions(null)
    // Keyed by document and tab, so opening another file (or another tab of this one) starts fresh.
    rightPane.setContent(<AssetDetailsPane key={`${props.document.id}:${props.initialTab ?? 'details'}`} {...props} />)
    rightPane.setExpanded?.(false)
}
