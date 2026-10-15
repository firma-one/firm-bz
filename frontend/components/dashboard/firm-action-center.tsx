'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
    Briefcase,
    MailOpen,
    AlertCircle,
    Clock,
    RefreshCw,
    CheckCircle2,
    ArrowUpRight,
    ArrowLeft,
    ChevronRight,
    TrendingUp,
    Bell,
    Share2,
    FileWarning,
    HardDrive,
    FolderOpen,
    MessageSquare,
    CheckCheck,
} from 'lucide-react'
import type { FirmInsightsResponse, ProspectItem, PendingInviteItem, EngagementDueSoonItem, UnansweredThreadItem } from '@/app/api/firms/[firmId]/insights/route'
import type { DriveAlertsResponse, EngagementDriveAlert } from '@/app/api/firms/[firmId]/drive-alerts/route'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'
import { markAllRemindersDone, markReminderDone } from '@/lib/actions/user-reminders'
import { clientPath, engagementPath } from '@/lib/navigation/firm-paths'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { ShimmerBlock } from '@/components/ui/shimmer'
import type { TagColor } from '@/lib/ui/status-colors'

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

function deltaColor(days: number): TagColor {
    if (days < 0) return 'red'
    if (days === 0) return 'yellow'
    if (days <= 3) return 'orange'
    if (days <= 7) return 'yellow'
    return 'gray'
}

function reminderLabelColor(style: ReminderWithContext['labelStyle']): TagColor {
    switch (style) {
        case 'red':    return 'red'
        case 'orange': return 'orange'
        case 'amber':  return 'yellow'
        default:       return 'gray'
    }
}

// ─── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-2">
                <Icon className="h-3.5 w-3.5 text-fg-subtle" />
                <span className="text-small font-medium text-fg-muted">{title}</span>
            </div>
            {children}
        </div>
    )
}

/** The calm "nothing here" line used in place of a green banner. */
function AllClear({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-control bg-surface-subtle px-3 py-2 text-small text-fg-muted">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-tag-green-fg" />
            {children}
        </div>
    )
}

// ─── Row Items ────────────────────────────────────────────────────────────────

const ROW_CLASS = 'group flex items-center justify-between gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-surface-hover'

function RowArrow() {
    return <ArrowUpRight className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
}

function reminderTypeBadge(entityKey: string, action: string): string {
    const table = entityKey.split('.').slice(0, 2).join('.')
    if (table === 'platform.clients') return `Client · ${action}`
    if (table === 'platform.engagements') return `Engagement · ${action}`
    return action
}

function ReminderRow({ reminder, onMarkDone, isMarkingDone }: { reminder: ReminderWithContext; onMarkDone?: () => void; isMarkingDone?: boolean }) {
    const typeBadge = reminderTypeBadge(reminder.entityKey, reminder.action)
    return (
        <div className={`${ROW_CLASS} items-start`}>
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{reminder.entityName}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Tag color="gray" className="shrink-0">{typeBadge}</Tag>
                    <Tag color={reminderLabelColor(reminder.labelStyle)}>{reminder.label}</Tag>
                    {reminder.note && <span className="truncate text-small text-fg-subtle">{reminder.note}</span>}
                </div>
            </div>
            <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {reminder.ctaUrl && (
                    <Link href={reminder.ctaUrl} target="_blank" rel="noopener noreferrer" className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg" aria-label={`Open ${reminder.entityName}`}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                )}
                {onMarkDone && (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkDone() }}
                        disabled={isMarkingDone}
                        className="rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-tag-green-fg disabled:opacity-50"
                        title="Mark done"
                        aria-label={`Mark ${reminder.entityName} done`}
                    >
                        <CheckCircle2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    )
}

function ThreadRow({ item, groupSlug, firmSlug }: { item: UnansweredThreadItem; groupSlug: string; firmSlug: string }) {
    const timeAgo = (() => {
        const diff = Date.now() - new Date(item.lastMessageAt).getTime()
        const h = Math.floor(diff / 3600000)
        if (h < 1) return 'Just now'
        if (h < 24) return `${h}h ago`
        return `${Math.floor(h / 24)}d ago`
    })()
    return (
        <Link
            href={engagementPath(groupSlug, firmSlug, item.clientSlug, item.engagementSlug)}
            target="_blank"
            rel="noopener noreferrer"
            className={ROW_CLASS}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="truncate text-ui text-fg">{item.documentName}</p>
                    <Tag color="gray" className="shrink-0">{item.engagementName}</Tag>
                </div>
                {item.lastMessage && <p className="mt-0.5 truncate text-small text-fg-muted">{item.lastMessage}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="text-small text-fg-subtle">{timeAgo}</span>
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
                <Tag color={deltaColor(item.daysUntil)}>{formatDelta(item.daysUntil)}</Tag>
                <RowArrow />
            </div>
        </Link>
    )
}

function InviteRow({ item, groupSlug, firmSlug }: { item: PendingInviteItem; groupSlug: string; firmSlug: string }) {
    const color: TagColor = item.daysUntilExpiry <= 2 ? 'red' : item.daysUntilExpiry <= 5 ? 'yellow' : 'gray'
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
                <Tag color={color}>{item.daysUntilExpiry <= 0 ? 'Expires today' : `Expires in ${item.daysUntilExpiry}d`}</Tag>
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
                <Tag color={deltaColor(item.daysUntil)}>{formatDelta(item.daysUntil)}</Tag>
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
                <span className="text-small tabular-nums text-fg-muted">{item.count} file{item.count !== 1 ? 's' : ''}</span>
                <RowArrow />
            </div>
        </Link>
    )
}

/** A summary line that opens one of the drill-in lists. Neutral when there is nothing to act on. */
function SummaryRow({ icon: Icon, color, title, subtitle, count, onClick }: {
    icon: React.ElementType
    color: TagColor | null
    title: string
    subtitle: string
    count: number
    onClick: () => void
}) {
    return (
        <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-hover">
            <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control ${color ? '' : 'bg-surface-muted text-fg-subtle'}`}
                style={color ? { backgroundColor: `var(--ui-tag-${color}-bg)`, color: `var(--ui-tag-${color}-fg)` } : undefined}
            >
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-ui text-fg">{title}</span>
                <span className="block truncate text-small text-fg-muted">{subtitle}</span>
            </span>
            <span className={`text-ui font-medium tabular-nums ${color ? 'text-fg' : 'text-fg-subtle'}`}>{count}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
        </button>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
    const [acView, setAcView] = useState<'summary' | 'overdue' | 'upcoming' | 'threads' | 'sharing' | 'sensitive' | 'storage'>('summary')
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

    const overdueSubtitle = (): string => {
        const parts: string[] = []
        if (overdueReminders.length) parts.push(`${overdueReminders.length} reminder${overdueReminders.length > 1 ? 's' : ''}`)
        if (overdueEngagements.length) parts.push(`${overdueEngagements.length} engagement${overdueEngagements.length > 1 ? 's' : ''}`)
        if (overdueProspects.length) parts.push(`${overdueProspects.length} prospect${overdueProspects.length > 1 ? 's' : ''}`)
        if (expiredInvites.length) parts.push(`${expiredInvites.length} invite${expiredInvites.length > 1 ? 's' : ''}`)
        return parts.slice(0, 3).join(' · ')
    }

    const upcomingSubtitle = (): string => {
        const parts: string[] = []
        if (upcomingReminders.length) parts.push(`${upcomingReminders.length} reminder${upcomingReminders.length > 1 ? 's' : ''}`)
        if (upcomingEngagements.length) parts.push(`${upcomingEngagements.length} engagement${upcomingEngagements.length > 1 ? 's' : ''}`)
        if (pendingInvites.length) parts.push(`${pendingInvites.length} invite${pendingInvites.length > 1 ? 's' : ''}`)
        return parts.slice(0, 3).join(' · ')
    }

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

    const sharingFileCount = driveAlerts?.sharing?.reduce((s, e) => s + e.count, 0) ?? 0
    const sensitiveFileCount = driveAlerts?.sensitive?.reduce((s, e) => s + e.count, 0) ?? 0
    const storageFileCount = driveAlerts?.storage?.reduce((s, e) => s + e.count, 0) ?? 0

    const driveViewLabel: Record<string, string> = { sharing: 'Sharing alerts', sensitive: 'Sensitive files', storage: 'Storage alerts' }
    const driveViewCount: Record<string, number> = { sharing: sharingFileCount, sensitive: sensitiveFileCount, storage: storageFileCount }
    const driveViewColor: Record<string, TagColor> = { sharing: 'blue', sensitive: 'orange', storage: 'purple' }
    const isDriveView = acView === 'sharing' || acView === 'sensitive' || acView === 'storage'
    const scannedCount = driveAlerts?.scannedCount ?? 0
    const totalDriveCount = driveAlerts?.totalCount ?? 0
    const hasPartialScan = totalDriveCount > scannedCount && totalDriveCount > 0

    const viewTitle = acView === 'overdue' ? 'Overdue' : acView === 'upcoming' ? 'Upcoming' : acView === 'threads' ? 'Unanswered threads' : driveViewLabel[acView]
    const viewCount = acView === 'overdue' ? overdueCount : acView === 'upcoming' ? upcomingCount : acView === 'threads' ? threadsCount : driveViewCount[acView]
    const viewColor: TagColor = acView === 'overdue' ? 'red' : acView === 'upcoming' ? 'yellow' : acView === 'threads' ? 'purple' : driveViewColor[acView] ?? 'gray'

    return (
        <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 print:h-auto">
            {/* Header */}
            <div className="flex h-7 items-center justify-between gap-2">
                {acView === 'summary' ? (
                    <h3 className="text-h3 text-fg">Action center</h3>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                        <Button variant="ghost" size="sm" onClick={() => setAcView('summary')} className="h-7 px-2">
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </Button>
                        <span className="truncate text-ui font-medium text-fg">{viewTitle}</span>
                        <Tag color={viewColor} className="ml-auto tabular-nums">{viewCount}</Tag>
                    </div>
                )}
                {acView === 'summary' && (
                    <Button variant="ghost" size="icon" onClick={() => setRefreshTick((t) => t + 1)} className="h-7 w-7" title="Refresh" aria-label="Refresh action center">
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                )}
            </div>

            {/* Content */}
            <div
                key={acView}
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-200 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] print:h-auto print:flex-none print:overflow-visible"
            >
                {loading ? (
                    <div className="flex flex-col gap-2" aria-busy="true">
                        {[1, 2, 3].map((i) => <ShimmerBlock key={i} className="h-10 w-full" />)}
                    </div>
                ) : acView === 'summary' ? (
                    <div className="flex flex-col gap-1">
                        {overdueCount === 0 && upcomingCount === 0 ? (
                            <AllClear>All caught up — no pending actions</AllClear>
                        ) : (
                            <>
                                {overdueCount > 0 && (
                                    <SummaryRow icon={AlertCircle} color="red" title="Overdue" subtitle={overdueSubtitle()} count={overdueCount} onClick={() => setAcView('overdue')} />
                                )}
                                {upcomingCount > 0 && (
                                    <SummaryRow icon={Clock} color="yellow" title="Upcoming" subtitle={upcomingSubtitle()} count={upcomingCount} onClick={() => setAcView('upcoming')} />
                                )}
                            </>
                        )}

                        {threadsCount > 0 && (
                            <SummaryRow icon={MessageSquare} color="purple" title="Unanswered threads" subtitle="Awaiting a reply from the firm" count={threadsCount} onClick={() => setAcView('threads')} />
                        )}

                        {/* Document alerts — drill-in rows */}
                        {driveLoading ? (
                            <ShimmerBlock className="mt-3 h-10 w-full" />
                        ) : (
                            <div className="mt-3 flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-2 px-2">
                                    <span className="flex items-center gap-1.5 text-small font-medium text-fg-muted">
                                        <FolderOpen className="h-3.5 w-3.5 text-fg-subtle" />
                                        Document alerts
                                    </span>
                                    {driveAlerts?.lastScannedAt ? (
                                        <span className="text-caption text-fg-subtle">Full scan · {timeAgo(driveAlerts.lastScannedAt)}</span>
                                    ) : hasPartialScan ? (
                                        <span className="flex items-center gap-1.5">
                                            <Tag color="orange">{scannedCount} of {totalDriveCount} scanned</Tag>
                                            <button
                                                type="button"
                                                onClick={handleScanAll}
                                                disabled={isScanningAll}
                                                className="flex items-center gap-1 rounded-control px-1.5 py-0.5 text-caption text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                                            >
                                                {isScanningAll ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                                                {isScanningAll ? 'Scanning…' : 'Scan all'}
                                            </button>
                                        </span>
                                    ) : null}
                                </div>
                                {([
                                    { key: 'sharing' as const, icon: Share2, label: 'Sharing', count: sharingFileCount, engCount: driveAlerts?.sharing?.length ?? 0, color: 'blue' as const },
                                    { key: 'sensitive' as const, icon: FileWarning, label: 'Sensitive', count: sensitiveFileCount, engCount: driveAlerts?.sensitive?.length ?? 0, color: 'orange' as const },
                                    { key: 'storage' as const, icon: HardDrive, label: 'Storage', count: storageFileCount, engCount: driveAlerts?.storage?.length ?? 0, color: 'purple' as const },
                                ]).map(({ key, icon, label, count, engCount, color }) => (
                                    <SummaryRow
                                        key={key}
                                        icon={icon}
                                        color={count > 0 ? color : null}
                                        title={label}
                                        subtitle={count > 0 ? `${engCount} engagement${engCount !== 1 ? 's' : ''}` : 'No alerts'}
                                        count={count}
                                        onClick={() => setAcView(key)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : acView === 'threads' ? (
                    <SectionBlock title="Unanswered client threads" icon={MessageSquare}>
                        {unansweredThreads.length > 0 ? unansweredThreads.map((t) => (
                            <ThreadRow key={t.threadId} item={t} groupSlug={groupSlug} firmSlug={firmSlug} />
                        )) : (
                            <AllClear>No unanswered threads</AllClear>
                        )}
                    </SectionBlock>
                ) : !isDriveView && acView === 'overdue' ? (
                    <div className="flex flex-col gap-4">
                        {overdueReminders.length > 0 && (
                            <SectionBlock title="Overdue reminders" icon={Bell}>
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
                            <SectionBlock title="Overdue engagements" icon={Briefcase}>
                                {overdueEngagements.slice(0, 5).map((e) => (
                                    <EngagementDueRow key={e.engagementId} item={e} groupSlug={groupSlug} firmSlug={firmSlug} />
                                ))}
                            </SectionBlock>
                        )}
                        {overdueProspects.length > 0 && (
                            <SectionBlock title="Overdue follow-ups" icon={TrendingUp}>
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
                    </div>
                ) : acView === 'upcoming' ? (
                    <div className="flex flex-col gap-4">
                        {upcomingReminders.length > 0 && (
                            <SectionBlock title="Upcoming reminders" icon={Bell}>
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
                    </div>
                ) : isDriveView ? (
                    (() => {
                        const items = acView === 'sharing' ? (driveAlerts?.sharing ?? []) : acView === 'sensitive' ? (driveAlerts?.sensitive ?? []) : (driveAlerts?.storage ?? [])
                        const icon = acView === 'sharing' ? Share2 : acView === 'sensitive' ? FileWarning : HardDrive
                        const title = acView === 'sharing' ? 'Engagements with sharing alerts' : acView === 'sensitive' ? 'Engagements with sensitive files' : 'Engagements with large files'
                        return items.length > 0 ? (
                            <SectionBlock title={title} icon={icon}>
                                {items.map((item) => (
                                    <DriveAlertRow key={item.engagementId} item={item} groupSlug={groupSlug} firmSlug={firmSlug} />
                                ))}
                            </SectionBlock>
                        ) : (
                            <AllClear>No alerts — all engagements look good</AllClear>
                        )
                    })()
                ) : null}
            </div>
        </div>
    )
}
