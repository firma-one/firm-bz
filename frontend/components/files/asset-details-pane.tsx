"use client"

import { isValidElement, useEffect, useRef, useState } from "react"
import { Activity as ActivityIcon, CalendarClock, CircleDot, FilePlus2, FilePen, FileType, History, Info, Loader2, MessagesSquare, UserRound } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentIcon } from "@/components/ui/document-icon"
import { PropertyList, PropertyRow } from "@/components/ui/property-list"
import { PersonAvatar, PersonProperty, type PersonOption } from "@/components/ui/property-cells"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { DocumentDocCommentsPane } from "@/components/projects/document-doc-comments-pane"
import { FileDueDateCell, FileStatusCell } from "@/components/projects/file-property-cells"
import { DocumentVersionsTimeline } from "@/components/files/document-versions-timeline"
import { DocumentActivityFeed } from "@/components/files/document-activity-feed"
import { DocumentNotesSection } from "@/components/files/document-notes-section"
import { useAuth } from "@/lib/auth-context"
import { cn, formatFileSize, formatFullDate, formatSmartDateTime, getFileTypeLabel } from "@/lib/utils"
import type { useRightPane } from "@/lib/right-pane-context"
import type { EngagementRoleSlug } from "@/lib/deliverable-stage-roles"
import type { ActivityStatus } from "@/lib/sharing-settings"

/**
 * A document's Details in one right pane, laid out as the Board's pane lays out a deliverable
 * (components/projects/shares/deliverable-detail-panel.tsx): the shared fields first — Status,
 * Assignee, Due, Created, Modified, Type — then tabs for Details (description and notes), Versions,
 * Activity and Discussions (.claude/plans/engagement-assets-details.md, Phase 2). Opened from the
 * document menu's Details item and from the row's Details icon; replaces the three separate panes
 * behind DETAILS_PANE_TABS.
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
    if (hasProject && !isExternalUser && !isLink) tabs.push('versions')
    if (hasProject && !isExternalUser) tabs.push('activity')
    if (hasProject) tabs.push('discussions')
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
    /** A deliverable or a document inside one: the work Status and Due track. Others read "—". */
    tracked: boolean
    canEditDue: boolean
    /** Engagement leads: the assignee and description routes allow them only. */
    canManage: boolean
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
    members: Member[]
    assigneeId: string | null
    setAssigneeId: (id: string | null) => void
    description: string
    setDescription: (value: string) => void
}

function useAssetRecord(projectId: string | undefined, recordId: string | undefined): AssetRecord {
    const canLoad = !!projectId && !!recordId && UUID.test(recordId)
    const [members, setMembers] = useState<Member[]>([])
    const [assigneeId, setAssigneeId] = useState<string | null>(null)
    const [description, setDescription] = useState('')

    useEffect(() => {
        if (!canLoad) return
        let cancelled = false
        ;(async () => {
            const headers = await authHeaders()
            const [sharingRes, membersRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/documents/${recordId}/sharing`, { headers }),
                fetch(`/api/projects/${projectId}/members`, { headers }),
            ])
            if (cancelled) return
            if (sharingRes.ok) {
                const settings = (await sharingRes.json()).sharing?.settings ?? {}
                if (cancelled) return
                setAssigneeId(typeof settings.assigneeUserId === 'string' ? settings.assigneeUserId : null)
                setDescription(typeof settings.description === 'string' ? settings.description : '')
            }
            if (membersRes.ok) {
                const data = await membersRes.json()
                if (!cancelled) setMembers(data.members ?? [])
            }
        })().catch(() => {})
        return () => { cancelled = true }
    }, [canLoad, projectId, recordId])

    return { canLoad, members, assigneeId, setAssigneeId, description, setDescription }
}

/** The shared fields at the top of the pane, as the Board's pane lists a deliverable's. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssetFields({ document, projectId, recordId, editing, record }: { document: any; projectId?: string; recordId?: string; editing?: AssetDetailsEditing; record: AssetRecord }) {
    const { addToast } = useToast()
    const { members, assigneeId, setAssigneeId } = record
    // Only the firm's own members can be assigned, as on a deliverable.
    const people = members.filter((m) => !m.isAgent && (m.role === 'eng_admin' || m.role === 'eng_member')).map(personOf)
    const assignee = assigneeId ? members.find((m) => m.userId === assigneeId) : undefined
    const canManage = !!editing?.canManage && record.canLoad
    const tracked = !!editing?.tracked
    const emptyLabel = tracked ? 'Not set' : '—'
    // Tracked work with no stage yet is at To do, as the Board and the Files row show it.
    const stage: ActivityStatus | null = document.activityStatus ?? document.deliverableStatus ?? (tracked ? 'to_do' : null)

    const changeAssignee = async (next: PersonOption | null) => {
        const res = await fetch(`/api/projects/${projectId}/documents/${recordId}/assignee`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ assigneeUserId: next?.id ?? null }),
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            addToast({ type: 'error', title: "Couldn't change the assignee", message: err.error ?? 'Please try again.' })
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
                        isFolder={false}
                        status={stage}
                        roleSlug={editing?.statusRole ?? null}
                        emptyLabel={emptyLabel}
                        emptyClassName="px-1.5 text-fg-subtle"
                        onSaved={(next) => {
                            document.activityStatus = next
                            editing?.onSaved?.()
                        }}
                        onAddToast={(t) => addToast({ ...t, type: t.type as Parameters<typeof addToast>[0]['type'] })}
                    />
                ) : (
                    <span className="px-1.5 text-fg-subtle">{emptyLabel}</span>
                )}
            </PropertyRow>
            <PropertyRow label="Assignee" icon={<UserRound />}>
                <PersonProperty
                    value={assignee ? personOf(assignee) : null}
                    people={people}
                    onChange={changeAssignee}
                    disabled={!canManage}
                    placeholder="No assignee"
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
                            editing.onSaved?.()
                        }}
                        onError={(message) => addToast({ type: 'error', title: "Couldn't set due date", message })}
                    />
                ) : (
                    <span className={cn('px-1.5', !validDate(document.dueDate) && 'text-fg-subtle')}>
                        {validDate(document.dueDate) ? formatFullDate(document.dueDate) : emptyLabel}
                    </span>
                )}
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

/** The Details tab: the description, then the firm's notes, as sections like the Board pane's. */
function AssetDetailsSections({ projectId, recordId, editing, record, showNotes }: { projectId?: string; recordId?: string; editing?: AssetDetailsEditing; record: AssetRecord; showNotes: boolean }) {
    const { addToast } = useToast()
    const { user } = useAuth()
    const { members, description, setDescription } = record
    const canManage = !!editing?.canManage && record.canLoad
    const [savingDescription, setSavingDescription] = useState(false)
    const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (descriptionTimer.current) clearTimeout(descriptionTimer.current) }, [])

    // Saved as you type, a moment after you stop — the Board pane's description works the same way.
    const changeDescription = (value: string) => {
        setDescription(value)
        if (descriptionTimer.current) clearTimeout(descriptionTimer.current)
        descriptionTimer.current = setTimeout(async () => {
            setSavingDescription(true)
            try {
                const res = await fetch(`/api/projects/${projectId}/documents/${recordId}/sharing`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                    body: JSON.stringify({ description: value }),
                })
                if (!res.ok) throw new Error(String(res.status))
            } catch {
                addToast({ type: 'error', title: "Couldn't save the description", message: 'Please try again.' })
            } finally {
                setSavingDescription(false)
            }
        }, 800)
    }

    return (
        <div className="divide-y divide-line">
            <div className="px-4 py-4">
                <div className={FIELD_LABEL}>
                    Description
                    {savingDescription && <Loader2 className="h-2.5 w-2.5 animate-spin text-fg-subtle" />}
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
                        {description || 'No description'}
                    </p>
                )}
            </div>

            {showNotes && record.canLoad && projectId && recordId && (
                <div className="px-4 py-4">
                    <DocumentNotesSection
                        projectId={projectId}
                        documentId={recordId}
                        members={members}
                        currentUserId={user?.id}
                        isLead={members.some((m) => m.userId === user?.id && m.role === 'eng_admin')}
                    />
                </div>
            )}
        </div>
    )
}

export function AssetDetailsPane({ document, projectId, orgSlug, isExternalUser = false, initialTab = 'details', editing }: AssetDetailsPaneProps) {
    const isLink = document.documentType === 'LINK'
    const tabs = assetDetailsTabs({ isExternalUser, isLink, hasProject: !!projectId })
    const [tab, setTab] = useState<AssetDetailsTab>(tabs.includes(initialTab) ? initialTab : 'details')
    // Comments, settings and audit events are keyed by the document's own row; the versions route takes either id.
    const recordId: string | undefined = document.projectDocumentId || document.id
    const record = useAssetRecord(projectId, recordId)
    // External users read the fields; they never edit here, and never see the notes.
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
                    <AssetDetailsSections projectId={projectId} recordId={recordId} editing={viewerEditing} record={record} showNotes={!isExternalUser} />
                </TabsContent>

                {projectId && tabs.includes('versions') && (
                    <TabsContent value="versions" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                        <DocumentVersionsTimeline document={document} projectId={projectId} />
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
                        <DocumentDocCommentsPane
                            engagementId={projectId}
                            documentId={recordId}
                            documentName={document.name}
                            documentMimeType={document.mimeType}
                            orgSlug={orgSlug}
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
