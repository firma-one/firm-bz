'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
    Briefcase,
    MailOpen,
    AlertTriangle,
    Clock,
    RefreshCw,
    CheckCircle2,
    ArrowUpRight,
    ChevronLeft,
    TrendingUp,
    Bell,
    Share2,
    FileWarning,
    HardDrive,
    FolderOpen,
    MessagesSquare,
    CheckCheck,
    CalendarClock,
    Inbox,
} from 'lucide-react'
import type { FirmInsightsResponse, ProspectItem, PendingInviteItem, EngagementDueSoonItem, UnansweredThreadItem } from '@/app/api/firms/[firmId]/insights/route'
import type { DriveAlertsResponse, EngagementDriveAlert } from '@/app/api/firms/[firmId]/drive-alerts/route'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'
import { markAllRemindersDone, markReminderDone } from '@/lib/actions/user-reminders'
import { clientPath, engagementPath } from '@/lib/navigation/firm-paths'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { ActionSection, attentionCount, type ActionItem } from '@/components/dashboard/action-list'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

function formatDelta(days: number): string {
    if (days < 0) return `${Math.abs(days)}d overdue`
    if (days === 0) return 'Today'
    if (days === 1) return 'Tomorrow'
    return `In ${days}d`
}

/** Dates as plain text, Linear-style: red once overdue, full strength when close, muted after. */
function deltaClass(days: number): string {
    if (days < 0) return 'text-danger'
    if (days <= 3) return 'text-fg'
    return 'text-fg-subtle'
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ─── Drill-down pieces ─────────────────────────────────────────────────────────

/** A quiet group label inside a drill-down, like the duplicate groups on the engagement page. */
function SectionBlock({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 px-2 pb-0.5">
                <Icon className="h-3.5 w-3.5 text-fg-subtle" />
                <span className="text-small font-medium text-fg-muted">{title}</span>
            </div>
            {children}
        </div>
    )
}

/** The calm "nothing here" line. */
function AllClear({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-1.5 px-2 py-1.5 text-small text-fg-subtle">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {children}
        </p>
    )
}

const ROW_CLASS = 'group flex items-center justify-between gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-surface-hover'

function RowArrow() {
    return <ArrowUpRight className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
}

function reminderTypeLabel(entityKey: string, action: string): string {
    const table = entityKey.split('.').slice(0, 2).join('.')
    if (table === 'platform.clients') return `Client · ${action}`
    if (table === 'platform.engagements') return `Engagement · ${action}`
    return action
}

function ReminderRow({ reminder, onMarkDone, isMarkingDone }: { reminder: ReminderWithContext; onMarkDone?: () => void; isMarkingDone?: boolean }) {
    const urgent = reminder.labelStyle === 'red' || reminder.labelStyle === 'orange'
    return (
        <div className={`${ROW_CLASS} items-start`}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{reminder.entityName}</p>
                <p className="truncate text-small text-fg-muted">
                    {reminderTypeLabel(reminder.entityKey, reminder.action)}
                    {' · '}
                    <span className={urgent ? 'text-danger' : undefined}>{reminder.label}</span>
                    {reminder.note && <span className="text-fg-subtle"> · {reminder.note}</span>}
                </p>
            </div>
            <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {reminder.ctaUrl && (
                    <Hint label="Open">
                        <Link href={reminder.ctaUrl} target="_blank" rel="noopener noreferrer" className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg" aria-label={`Open ${reminder.entityName}`}>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                    </Hint>
                )}
                {onMarkDone && (
                    <Hint label="Mark done">
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkDone() }}
                            disabled={isMarkingDone}
                            className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                            aria-label={`Mark ${reminder.entityName} done`}
                        >
                            <CheckCircle2 className="h-4 w-4" />
                        </button>
                    </Hint>
                )}
            </div>
        </div>
    )
}

function ThreadRow({ item, groupSlug, firmSlug }: { item: UnansweredThreadItem; groupSlug: string; firmSlug: string }) {
    return (
        <Link
            href={engagementPath(groupSlug, firmSlug, item.clientSlug, item.engagementSlug)}
            target="_blank"
            rel="noopener noreferrer"
            className={ROW_CLASS}
        >
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{item.documentName}</p>
                <p className="truncate text-small text-fg-muted">
                    {item.engagementName}
                    {item.lastMessage && <span className="text-fg-subtle"> · {item.lastMessage}</span>}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-small text-fg-subtle">{timeAgo(item.lastMessageAt)}</span>
                <RowArrow />
            </div>
        </Link>
    )
}

function ProspectRow({ item, groupSlug, firmSlug }: { item: ProspectItem; groupSlug: string; firmSlug: string }) {
    return (
        <Link href={clientPath(groupSlug, firmSlug, item.clientSlug)} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{item.clientName}</p>
                <p className="truncate text-small text-fg-muted">
                    {item.expectedCloseDate
                        ? `Prospect · expected close ${new Date(item.expectedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : 'Prospect · follow-up due'}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`text-small tabular-nums ${deltaClass(item.daysUntil)}`}>{formatDelta(item.daysUntil)}</span>
                <RowArrow />
            </div>
        </Link>
    )
}

function InviteRow({ item, groupSlug, firmSlug }: { item: PendingInviteItem; groupSlug: string; firmSlug: string }) {
    return (
        <Link
            href={engagementPath(groupSlug, firmSlug, item.clientSlug, item.engagementSlug, { tab: 'members' })}
            target="_blank"
            rel="noopener noreferrer"
            className={ROW_CLASS}
        >
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{item.email}</p>
                <p className="truncate text-small text-fg-muted">{item.engagementName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`text-small tabular-nums ${item.daysUntilExpiry <= 2 ? 'text-danger' : 'text-fg-subtle'}`}>
                    {item.daysUntilExpiry <= 0 ? 'Expires today' : `Expires in ${item.daysUntilExpiry}d`}
                </span>
                <RowArrow />
            </div>
        </Link>
    )
}

function EngagementDueRow({ item, groupSlug, firmSlug }: { item: EngagementDueSoonItem; groupSlug: string; firmSlug: string }) {
    return (
        <Link href={engagementPath(groupSlug, firmSlug, item.clientSlug, item.engagementSlug)} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{item.engagementName}</p>
                <p className="truncate text-small text-fg-muted">{item.clientName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`text-small tabular-nums ${deltaClass(item.daysUntil)}`}>{formatDelta(item.daysUntil)}</span>
                <RowArrow />
            </div>
        </Link>
    )
}

function DriveAlertRow({ item, groupSlug, firmSlug }: { item: EngagementDriveAlert; groupSlug: string; firmSlug: string }) {
    return (
        <Link href={engagementPath(groupSlug, firmSlug, item.clientSlug, item.engagementSlug)} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{item.engagementName}</p>
                <p className="truncate text-small text-fg-muted">{item.clientName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-small tabular-nums text-fg-muted">{plural(item.count, 'file')}</span>
                <RowArrow />
            </div>
        </Link>
    )
}

/** The drill-down's own header under the Action Center title, as on the engagement page. */
function DrilldownHeader({ title, meta, onBack }: { title: string; meta: string; onBack: () => void }) {
    return (
        <div className="flex items-center gap-2 border-b border-line pb-3">
            <button
                type="button"
                onClick={onBack}
                className="group/back inline-flex items-center gap-1 text-small text-fg-subtle transition-colors hover:text-fg-muted"
            >
                <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover/back:-translate-x-0.5" />
                Back
            </button>
            <span className="text-small text-fg-subtle">·</span>
            <span className="truncate text-small font-medium text-fg-muted">{title}</span>
            <span className="ml-auto shrink-0 text-small tabular-nums text-fg-subtle">{meta}</span>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type DriveKind = 'sharing' | 'sensitive' | 'storage'
type AcView = 'summary' | 'overdue' | 'upcoming' | 'threads' | DriveKind

interface FirmActionCenterProps {
    firmId: string
    groupSlug: string
    firmSlug: string
}

export function FirmActionCenter({ firmId, groupSlug, firmSlug }: FirmActionCenterProps) {
    const { session } = useAuth()
    const [data, setData] = useState<FirmInsightsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)
    const [acView, setAcView] = useState<AcView>('summary')
    const [isMarkingDone, setIsMarkingDone] = useState(false)
    const [markingDoneId, setMarkingDoneId] = useState<string | null>(null)
    const [driveAlerts, setDriveAlerts] = useState<DriveAlertsResponse | null>(null)
    const [driveLoading, setDriveLoading] = useState(true)
    const [isScanningAll, setIsScanningAll] = useState(false)

    useEffect(() => {
        if (!session?.access_token) return
        setLoading(true)
        fetch(`/api/firms/${firmId}/insights`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
            .then((r) => r.json())
            .then((d) => { setData(d); setAcView('summary') })
            .catch((e) => console.error('Failed to load firm insights', e))
            .finally(() => setLoading(false))
    }, [firmId, session, refreshTick])

    useEffect(() => {
        if (!session?.access_token) return
        setDriveLoading(true)
        fetch(`/api/firms/${firmId}/drive-alerts`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
            .then(r => r.json())
            .then(d => setDriveAlerts(d))
            .catch(e => console.error('Failed to load drive alerts', e))
            .finally(() => setDriveLoading(false))
    }, [firmId, session, refreshTick])

    // Overdue bucket
    const overdueReminders = data?.urgentReminders ?? []
    const overdueEngagements = data?.engagementsDueSoon?.filter(e => e.daysUntil < 0) ?? []
    // Deduplicate: exclude prospects already covered by a reminder on the same client
    const reminderClientIds = new Set(
        overdueReminders
            .filter(r => r.entityKey.startsWith('platform.clients'))
            .map(r => r.entityValue)
            .filter(Boolean)
    )
    const overdueProspects = (data?.prospects?.filter(p => p.daysUntil < 0) ?? [])
        .filter(p => !reminderClientIds.has(p.clientId))
    const expiredInvites = data?.pendingInvitations?.filter(i => i.daysUntilExpiry <= 0) ?? []
    const overdueCount = overdueReminders.length + overdueEngagements.length + overdueProspects.length + expiredInvites.length

    // Upcoming bucket
    const upcomingReminders = data?.upcomingReminders ?? []
    const upcomingEngagements = data?.engagementsDueSoon?.filter(e => e.daysUntil >= 0) ?? []
    const pendingInvites = data?.pendingInvitations?.filter(i => i.daysUntilExpiry > 0) ?? []
    const upcomingCount = upcomingReminders.length + upcomingEngagements.length + pendingInvites.length

    const breakdown = (parts: [number, string][]): string =>
        parts.filter(([n]) => n > 0).slice(0, 3).map(([n, word]) => plural(n, word)).join(' · ')

    const overdueSubtitle = breakdown([
        [overdueReminders.length, 'reminder'],
        [overdueEngagements.length, 'engagement'],
        [overdueProspects.length, 'prospect'],
        [expiredInvites.length, 'invite'],
    ])
    const upcomingSubtitle = breakdown([
        [upcomingReminders.length, 'reminder'],
        [upcomingEngagements.length, 'engagement'],
        [pendingInvites.length, 'invite'],
    ])

    const unansweredThreads = data?.unansweredThreads ?? []
    const threadsCount = unansweredThreads.length

    async function handleMarkAllDone(reminders: ReminderWithContext[]) {
        if (!reminders.length) return
        setIsMarkingDone(true)
        try {
            await markAllRemindersDone(reminders.map((r) => r.id))
            setRefreshTick((t) => t + 1)
        } finally {
            setIsMarkingDone(false)
        }
    }

    async function handleMarkOneDone(reminderId: string) {
        setMarkingDoneId(reminderId)
        try {
            await markReminderDone(reminderId)
            setRefreshTick((t) => t + 1)
        } finally {
            setMarkingDoneId(null)
        }
    }

    async function handleScanAll() {
        if (!session?.access_token) return
        setIsScanningAll(true)
        try {
            const res = await fetch(`/api/firms/${firmId}/drive-alerts`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
            })
            const d = await res.json()
            setDriveAlerts(d)
        } finally {
            setIsScanningAll(false)
        }
    }

    const driveItems = (kind: DriveKind): EngagementDriveAlert[] => driveAlerts?.[kind] ?? []
    const driveFileCount = (kind: DriveKind) => driveItems(kind).reduce((s, e) => s + e.count, 0)
    const scannedCount = driveAlerts?.scannedCount ?? 0
    const totalDriveCount = driveAlerts?.totalCount ?? 0
    const hasPartialScan = totalDriveCount > scannedCount && totalDriveCount > 0

    const followUps: ActionItem[] = [
        { key: 'overdue', label: 'Overdue', count: overdueCount, severity: 'critical', icon: AlertTriangle,
          sub: overdueSubtitle, onSelect: () => setAcView('overdue') },
        { key: 'upcoming', label: 'Upcoming', count: upcomingCount, severity: 'info', icon: Clock,
          sub: upcomingSubtitle, onSelect: () => setAcView('upcoming') },
        { key: 'threads', label: 'Unanswered comments', count: threadsCount, severity: 'warning', icon: MessagesSquare,
          sub: 'client waiting on a reply', onSelect: () => setAcView('threads') },
    ]

    const DRIVE_META: Record<DriveKind, { label: string; severity: ActionItem['severity']; icon: React.ElementType; listTitle: string }> = {
        sensitive: { label: 'Sensitive files', severity: 'critical', icon: FileWarning, listTitle: 'Engagements with sensitive files' },
        sharing: { label: 'Sharing alerts', severity: 'warning', icon: Share2, listTitle: 'Engagements with sharing alerts' },
        storage: { label: 'Large files', severity: 'warning', icon: HardDrive, listTitle: 'Engagements with large files' },
    }
    const documents: ActionItem[] = (['sensitive', 'sharing', 'storage'] as const).map((kind) => ({
        key: kind,
        label: DRIVE_META[kind].label,
        count: driveFileCount(kind),
        severity: DRIVE_META[kind].severity,
        icon: DRIVE_META[kind].icon,
        sub: `in ${plural(driveItems(kind).length, 'engagement')}`,
        onSelect: () => setAcView(kind),
    }))

    const attentionTotal = attentionCount(followUps, driveLoading ? [] : documents)

    // How fresh the document scan is — a footnote under the Documents group, not a header badge.
    const scanNote = driveAlerts?.lastScannedAt ? (
        <p className="px-2 pt-1 text-caption text-fg-subtle">Full scan {timeAgo(driveAlerts.lastScannedAt)}</p>
    ) : hasPartialScan ? (
        <div className="flex items-center gap-1.5 px-2 pt-1 text-caption text-fg-subtle">
            <span>{scannedCount} of {totalDriveCount} engagements scanned</span>
            <span>·</span>
            <button
                type="button"
                onClick={handleScanAll}
                disabled={isScanningAll}
                className="inline-flex items-center gap-1 rounded-control text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline disabled:opacity-50 print:hidden"
            >
                {isScanningAll && <RefreshCw className="h-3 w-3 animate-spin" />}
                {isScanningAll ? 'Scanning…' : 'Scan all'}
            </button>
        </div>
    ) : null

    return (
        <div className="sticky top-0 print:static">
            <div className="flex flex-col gap-6 xl:border-l xl:border-line xl:pl-6">
                {/* Header — the same shape as the section headings on the left, so the two line up:
                    icon, title, a plain count of items needing attention, a quiet refresh. */}
                <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Inbox className="h-4 w-4 shrink-0 text-fg-subtle" />
                        <h2 className="truncate text-h3 text-fg">Action Center</h2>
                        {!loading && attentionTotal > 0 && (
                            <span className="text-small tabular-nums text-fg-subtle">{attentionTotal}</span>
                        )}
                    </div>
                    <Hint label="Refresh">
                        <button
                            type="button"
                            onClick={() => setRefreshTick((t) => t + 1)}
                            className="rounded-control p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg print:hidden"
                            aria-label="Refresh action center"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </Hint>
                </div>

                {loading ? (
                    <div className="flex flex-col gap-2" aria-busy="true">
                        {[1, 2, 3].map((i) => <ShimmerBlock key={i} className="h-10 w-full" />)}
                    </div>
                ) : acView === 'summary' ? (
                    <div className="flex flex-col gap-4">
                        <ActionSection title="Follow-ups" icon={CalendarClock} items={followUps} />
                        {driveLoading ? (
                            <ShimmerBlock className="h-10 w-full" />
                        ) : (
                            <ActionSection title="Documents" icon={FolderOpen} items={documents} footer={scanNote} />
                        )}
                    </div>
                ) : (
                    <div key={acView} className="flex flex-col gap-3 animate-in fade-in duration-200">
                        {acView === 'threads' ? (
                            <>
                                <DrilldownHeader title="Unanswered comments" meta={plural(threadsCount, 'thread')} onBack={() => setAcView('summary')} />
                                {unansweredThreads.length > 0 ? (
                                    <div className="flex flex-col">
                                        {unansweredThreads.map((t) => (
                                            <ThreadRow key={t.threadId} item={t} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </div>
                                ) : (
                                    <AllClear>No unanswered comments</AllClear>
                                )}
                            </>
                        ) : acView === 'overdue' ? (
                            <>
                                <DrilldownHeader title="Overdue" meta={plural(overdueCount, 'item')} onBack={() => setAcView('summary')} />
                                {overdueCount === 0 && <AllClear>Nothing overdue</AllClear>}
                                {overdueReminders.length > 0 && (
                                    <SectionBlock title="Reminders" icon={Bell}>
                                        {overdueReminders.slice(0, 5).map((r) => (
                                            <ReminderRow key={r.id} reminder={r} onMarkDone={() => handleMarkOneDone(r.id)} isMarkingDone={markingDoneId === r.id} />
                                        ))}
                                        <Button variant="ghost" size="sm" onClick={() => handleMarkAllDone(overdueReminders)} disabled={isMarkingDone} className="mt-1 w-full">
                                            <CheckCheck className="h-3.5 w-3.5" />
                                            Mark all done
                                        </Button>
                                    </SectionBlock>
                                )}
                                {overdueEngagements.length > 0 && (
                                    <SectionBlock title="Engagements" icon={Briefcase}>
                                        {overdueEngagements.slice(0, 5).map((e) => (
                                            <EngagementDueRow key={e.engagementId} item={e} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                )}
                                {overdueProspects.length > 0 && (
                                    <SectionBlock title="Prospect follow-ups" icon={TrendingUp}>
                                        {overdueProspects.slice(0, 5).map((p) => (
                                            <ProspectRow key={p.clientId} item={p} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                )}
                                {expiredInvites.length > 0 && (
                                    <SectionBlock title="Expired invitations" icon={MailOpen}>
                                        {expiredInvites.slice(0, 5).map((inv) => (
                                            <InviteRow key={inv.invitationId} item={inv} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                )}
                            </>
                        ) : acView === 'upcoming' ? (
                            <>
                                <DrilldownHeader title="Upcoming" meta={plural(upcomingCount, 'item')} onBack={() => setAcView('summary')} />
                                {upcomingCount === 0 && <AllClear>Nothing upcoming</AllClear>}
                                {upcomingReminders.length > 0 && (
                                    <SectionBlock title="Reminders" icon={Bell}>
                                        {upcomingReminders.slice(0, 5).map((r) => (
                                            <ReminderRow key={r.id} reminder={r} />
                                        ))}
                                        <Button variant="ghost" size="sm" onClick={() => handleMarkAllDone(upcomingReminders)} disabled={isMarkingDone} className="mt-1 w-full">
                                            <CheckCheck className="h-3.5 w-3.5" />
                                            Mark all done
                                        </Button>
                                    </SectionBlock>
                                )}
                                {upcomingEngagements.length > 0 && (
                                    <SectionBlock title="Engagement due dates" icon={Briefcase}>
                                        {upcomingEngagements.slice(0, 6).map((e) => (
                                            <EngagementDueRow key={e.engagementId} item={e} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                )}
                                {pendingInvites.length > 0 && (
                                    <SectionBlock title="Pending invitations" icon={MailOpen}>
                                        {pendingInvites.slice(0, 5).map((inv) => (
                                            <InviteRow key={inv.invitationId} item={inv} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                )}
                            </>
                        ) : (
                            <>
                                <DrilldownHeader title={DRIVE_META[acView].label} meta={plural(driveFileCount(acView), 'file')} onBack={() => setAcView('summary')} />
                                {driveItems(acView).length > 0 ? (
                                    <SectionBlock title={DRIVE_META[acView].listTitle} icon={DRIVE_META[acView].icon}>
                                        {driveItems(acView).map((item) => (
                                            <DriveAlertRow key={item.engagementId} item={item} groupSlug={groupSlug} firmSlug={firmSlug} />
                                        ))}
                                    </SectionBlock>
                                ) : (
                                    <AllClear>No alerts — all engagements look good</AllClear>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
