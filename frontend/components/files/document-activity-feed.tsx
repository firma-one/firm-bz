"use client"

import { useCallback, useEffect, useState } from "react"
import {
    AlertCircle, Ban, CircleDot, Clock, Download, Eye, FilePen, FilePlus2, FolderInput, History, Lock, LockOpen,
    MessageSquare, RotateCcw, Share2, Trash2,
} from "lucide-react"
import type { DriveRevision } from "@/lib/types"
import type { ActivityStatus } from "@/lib/sharing-settings"
import { BLOCKED_REASON_LABEL, type BlockedReason } from "@/lib/files/blocked"
import { STATUS } from "@/lib/ui/status"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { Button } from "@/components/ui/button"
import { useDocumentVersions } from "@/components/files/use-document-versions"

/**
 * A document's activity: what people did to it through Firma (the audit log, which every storage
 * provider shares) with the provider's own edits merged in where the storage lists them (Google
 * today). Edits made straight in Word or Drive never pass through Firma, so the version list is
 * the only place they show.
 *
 * History reaches back as far as the firm's plan keeps audit records — older rows are purged on
 * write (lib/audit/emit.ts), so there is nothing older to show.
 */

/** What each recorded action reads as after the person's name. Indexing is system noise, left out. */
const VERB: Record<string, string> = {
    DOCUMENT_CREATED: 'added this file',
    DOCUMENT_CHANGED: 'updated this file',
    DOCUMENT_DELETED: 'deleted this file',
    DOCUMENT_RESTORED: 'restored this file',
    DOCUMENT_MOVED: 'moved this file',
    DOCUMENT_VERSIONED: 'added a new version',
    DOCUMENT_OPENED: 'opened this file',
    DOCUMENT_DOWNLOADED: 'downloaded this file',
    DOCUMENT_FINALIZED: 'finalized this file',
    DOCUMENT_UNLOCKED: 'unlocked this file',
    DOCUMENT_STATUS_CHANGED: 'changed the stage',
    DOCUMENT_BLOCKED: 'marked this file blocked',
    DOCUMENT_UNBLOCKED: 'cleared the block',
    DOCUMENT_COMMENT_CREATED: 'commented',
    DOCUMENT_COMMENT_CHANGED: 'edited a comment',
    DOCUMENT_COMMENT_DELETED: 'deleted a comment',
    DOCUMENT_SHARE_CREATED: 'shared this file',
    DOCUMENT_SHARE_CHANGED: 'changed how this file is shared',
    DOCUMENT_SHARE_DELETED: 'stopped sharing this file',
    DOCUMENT_SHARE_VIEWED: 'viewed the shared file',
    DOCUMENT_SHARE_DOWNLOADED: 'downloaded the shared file',
    DOCUMENT_SHARE_REGRANTED: 'reopened access to this file',
}

const ACTIVITY_EVENT_TYPES = Object.keys(VERB)

const PAGE_SIZE = 50

/** An audit row as GET /api/projects/[projectId]/audit returns it. */
export interface AuditEventRow {
    id: string
    eventType: string
    eventAt: string
    actorName: string | null
    actorEmail: string | null
    metadata: unknown
}

export interface ActivityEntry {
    id: string
    /** The audit event type, or REVISION_EDIT for an edit the storage's version list shows. */
    type: string
    at: string
    who: string
    what: string
    detail?: string
}

/** A storage edit from the version list, which never passed through Firma's audit log. */
export const REVISION_EDIT = 'REVISION_EDIT'

function stageLabel(value: unknown): string {
    return typeof value === 'string' && value in STATUS.deliverable
        ? STATUS.deliverable[value as ActivityStatus].label
        : '—'
}

function detailOf(eventType: string, m: Record<string, unknown>): string | undefined {
    const parts: string[] = []
    if (eventType === 'DOCUMENT_STATUS_CHANGED' && m.newStatus) {
        parts.push(`${stageLabel(m.oldStatus)} → ${stageLabel(m.newStatus)}`)
    }
    // Which version an approval, its lock or a reopening was about, as its storage names it.
    if ((eventType === 'DOCUMENT_STATUS_CHANGED' || eventType === 'DOCUMENT_FINALIZED' || eventType === 'DOCUMENT_UNLOCKED') && typeof m.versionName === 'string') {
        parts.push(m.versionName)
    }
    // What it waits on, and why, in the person's words.
    if (eventType === 'DOCUMENT_BLOCKED' && typeof m.reason === 'string' && m.reason in BLOCKED_REASON_LABEL) {
        parts.push(BLOCKED_REASON_LABEL[m.reason as BlockedReason] + (typeof m.note === 'string' && m.note ? ` · ${m.note}` : ''))
    }
    // A rename: the old name is what a reader is checking.
    if (typeof m.previousName === 'string' && typeof m.fileName === 'string' && m.previousName !== m.fileName) {
        parts.push(`${m.previousName} → ${m.fileName}`)
    }
    // The agent proposes and a person approves; never let the feed read as a machine acting alone.
    if (m.viaAgent) {
        const by = typeof m.approvedByLabel === 'string' ? m.approvedByLabel
            : typeof m.approvedBy === 'string' ? m.approvedBy
            : null
        parts.push(by ? `via Brio, approved by ${by}` : 'via Brio')
    }
    return parts.length > 0 ? parts.join(' · ') : undefined
}

/**
 * Audit events and provider revisions as one list, newest first.
 *
 * While older audit events are still unloaded (`complete` false), revisions older than the oldest
 * loaded event are held back: showing them would put them above audit events that load later.
 */
export function activityEntries(events: AuditEventRow[], revisions: DriveRevision[], complete: boolean): ActivityEntry[] {
    const fromAudit: ActivityEntry[] = events
        .filter((e) => VERB[e.eventType])
        .map((e) => {
            const m = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>
            return {
                id: e.id,
                type: e.eventType,
                at: e.eventAt,
                who: e.actorName || e.actorEmail || 'Someone',
                what: VERB[e.eventType],
                detail: detailOf(e.eventType, m),
            }
        })

    const oldestLoaded = fromAudit.reduce<number | null>((min, e) => {
        const t = new Date(e.at).getTime()
        return min === null || t < min ? t : min
    }, null)

    const fromRevisions: ActivityEntry[] = revisions
        .filter((r) => complete || oldestLoaded === null || new Date(r.modifiedTime).getTime() >= oldestLoaded)
        .map((r) => ({
            id: `revision-${r.id}`,
            type: REVISION_EDIT,
            at: r.modifiedTime,
            who: r.lastModifyingUser?.displayName || 'Someone',
            what: 'edited this file',
        }))

    return [...fromAudit, ...fromRevisions].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

export interface ActivityItem extends ActivityEntry {
    /** How many times in a row the same person did the same thing that day: "opened this file 3 times". */
    count: number
}

export interface ActivityDay {
    /** Today, Yesterday, or the date ("Oct 24", with the year when it isn't this one). */
    label: string
    items: ActivityItem[]
}

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(d: Date, now: Date): string {
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (dayKey(d) === dayKey(now)) return 'Today'
    if (dayKey(d) === dayKey(yesterday)) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

/**
 * Entries (newest first) grouped by day, in the viewer's local time. The same person doing the same
 * thing several times in a row on one day folds into one line with a count; each line keeps the
 * time of the latest.
 */
export function groupActivity(entries: ActivityEntry[], now: Date = new Date()): ActivityDay[] {
    const days: ActivityDay[] = []
    let lastKey: string | null = null
    for (const entry of entries) {
        const at = new Date(entry.at)
        const key = dayKey(at)
        if (key !== lastKey) {
            days.push({ label: dayLabel(at, now), items: [] })
            lastKey = key
        }
        const items = days[days.length - 1].items
        const previous = items[items.length - 1]
        if (previous && previous.who === entry.who && previous.type === entry.type && previous.detail === entry.detail) {
            previous.count += 1
        } else {
            items.push({ ...entry, count: 1 })
        }
    }
    return days
}

/** Each kind of event's mark on the timeline. */
function iconFor(type: string): React.ComponentType<{ className?: string }> {
    if (type === 'DOCUMENT_OPENED' || type === 'DOCUMENT_SHARE_VIEWED') return Eye
    if (type === 'DOCUMENT_DOWNLOADED' || type === 'DOCUMENT_SHARE_DOWNLOADED') return Download
    if (type === 'DOCUMENT_STATUS_CHANGED') return CircleDot
    if (type === 'DOCUMENT_BLOCKED' || type === 'DOCUMENT_UNBLOCKED') return Ban
    if (type.startsWith('DOCUMENT_COMMENT_')) return MessageSquare
    if (type.startsWith('DOCUMENT_SHARE_')) return Share2
    if (type === 'DOCUMENT_MOVED') return FolderInput
    if (type === 'DOCUMENT_CREATED') return FilePlus2
    if (type === 'DOCUMENT_DELETED') return Trash2
    if (type === 'DOCUMENT_RESTORED') return RotateCcw
    if (type === 'DOCUMENT_FINALIZED') return Lock
    if (type === 'DOCUMENT_UNLOCKED') return LockOpen
    if (type === 'DOCUMENT_VERSIONED') return History
    return FilePen
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DocumentActivityFeedProps {
    /** The document's own row id (engagement_documents.id), which audit events are keyed by. */
    projectDocumentId?: string
    /** The id the versions route takes (the row id or the provider's). */
    documentId: string
    projectId: string
    /** Links have no provider versions to merge. */
    isLink?: boolean
}

export function DocumentActivityFeed({ projectDocumentId, documentId, projectId, isLink }: DocumentActivityFeedProps) {
    const recordId = projectDocumentId && UUID.test(projectDocumentId) ? projectDocumentId : undefined
    const versions = useDocumentVersions(isLink ? undefined : documentId, isLink ? undefined : projectId)
    const [events, setEvents] = useState<AuditEventRow[]>([])
    const [cursor, setCursor] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState(false)

    const load = useCallback(async (after: string | null) => {
        if (!recordId) return { events: [] as AuditEventRow[], nextCursor: null as string | null }
        const qs = new URLSearchParams({ documentId: recordId, limit: String(PAGE_SIZE) })
        for (const t of ACTIVITY_EVENT_TYPES) qs.append('eventType', t)
        if (after) qs.set('cursor', after)
        const res = await fetch(`/api/projects/${projectId}/audit?${qs.toString()}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        return { events: (data.events ?? []) as AuditEventRow[], nextCursor: (data.nextCursor ?? null) as string | null }
    }, [recordId, projectId])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        load(null)
            .then((page) => {
                if (cancelled) return
                setEvents(page.events)
                setCursor(page.nextCursor)
            })
            .catch(() => { if (!cancelled) setError(true) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [load])

    const loadMore = async () => {
        if (!cursor) return
        setLoadingMore(true)
        try {
            const page = await load(cursor)
            setEvents((prev) => [...prev, ...page.events])
            setCursor(page.nextCursor)
        } catch {
            setError(true)
        } finally {
            setLoadingMore(false)
        }
    }

    const busy = loading || (!isLink && versions.loading)
    const entries = activityEntries(events, isLink ? [] : versions.revisions, cursor === null)

    if (busy) {
        return (
            <div className="space-y-4 pl-5">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse space-y-1.5">
                        <div className="h-3 w-2/3 rounded bg-surface-muted" />
                        <div className="h-2.5 w-1/3 rounded bg-surface-muted" />
                    </div>
                ))}
            </div>
        )
    }

    if (error && entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-fg-subtle" />
                <p className="text-xs text-fg-muted">Failed to load activity</p>
            </div>
        )
    }

    if (entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Clock className="h-5 w-5 text-fg-subtle" />
                <p className="text-xs text-fg-muted">No activity recorded yet.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {groupActivity(entries).map((day) => (
                <section key={day.label}>
                    <h4 className="mb-2 text-caption font-medium text-fg-subtle">{day.label}</h4>
                    <ol className="ml-2 border-l border-line">
                        {day.items.map((item) => {
                            const Icon = iconFor(item.type)
                            return (
                                <li key={item.id} className="relative pb-3 pl-5 last:pb-0">
                                    <span aria-hidden className="absolute -left-[9px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-surface text-fg-muted">
                                        <Icon className="h-2.5 w-2.5" />
                                    </span>
                                    <p className="text-xs leading-snug">
                                        <span className="font-medium text-fg">{item.who}</span>{' '}
                                        <span className="text-fg-muted">{item.what}{item.count > 1 ? ` ${item.count} times` : ''}</span>
                                        <span className="text-fg-subtle"> · </span>
                                        <RelativeDateTime date={item.at} textClassName="text-caption text-fg-subtle" tooltipSide="left" />
                                    </p>
                                    {item.detail && <p className="mt-0.5 truncate text-caption text-fg-muted" title={item.detail}>{item.detail}</p>}
                                </li>
                            )
                        })}
                    </ol>
                </section>
            ))}
            {cursor && (
                <Button variant="ghost" size="sm" className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Show older activity'}
                </Button>
            )}
        </div>
    )
}
