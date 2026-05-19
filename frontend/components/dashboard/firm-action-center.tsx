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

function deltaColor(days: number): string {
    if (days < 0) return 'bg-red-50 text-red-700 border-red-200'
    if (days === 0) return 'bg-amber-50 text-amber-700 border-amber-200'
    if (days <= 3) return 'bg-orange-50 text-orange-700 border-orange-200'
    if (days <= 7) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-slate-50 text-slate-600 border-slate-200'
}

function reminderLabelColor(style: ReminderWithContext['labelStyle']): string {
    switch (style) {
        case 'red':    return 'bg-red-50 text-red-700 border-red-200'
        case 'orange': return 'bg-orange-50 text-orange-700 border-orange-200'
        case 'amber':  return 'bg-amber-50 text-amber-700 border-amber-200'
        default:       return 'bg-slate-50 text-slate-600 border-slate-200'
    }
}

// ─── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
            </div>
            {children}
        </div>
    )
}

// ─── Row Items ────────────────────────────────────────────────────────────────

function reminderTypeBadge(entityKey: string, action: string): string {
    const table = entityKey.split('.').slice(0, 2).join('.')
    if (table === 'platform.clients') return `Client · ${action}`
    if (table === 'platform.engagements') return `Engagement · ${action}`
    return action
}

function ReminderRow({ reminder, onMarkDone, isMarkingDone }: { reminder: ReminderWithContext; onMarkDone?: () => void; isMarkingDone?: boolean }) {
    const labelClass = reminderLabelColor(reminder.labelStyle)
    const typeBadge = reminderTypeBadge(reminder.entityKey, reminder.action)
    return (
        <div className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{reminder.entityName}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 shrink-0">{typeBadge}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${labelClass}`}>
                        {reminder.label}
                    </span>
                    {reminder.note && (
                        <span className="text-xs text-gray-400 truncate">{reminder.note}</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {reminder.ctaUrl && (
                    <Link href={reminder.ctaUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 transition-colors p-1">
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                )}
                {onMarkDone && (
                    <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkDone(); }}
                        disabled={isMarkingDone}
                        className="p-1 rounded-lg hover:bg-green-50 text-gray-300 hover:text-green-600 transition-colors disabled:opacity-50"
                        title="Mark done"
                    >
                        <CheckCircle2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    )
}

function ThreadRow({ item, firmSlug }: { item: UnansweredThreadItem; firmSlug: string }) {
    const timeAgo = (() => {
        const diff = Date.now() - new Date(item.lastMessageAt).getTime()
        const h = Math.floor(diff / 3600000)
        if (h < 1) return 'Just now'
        if (h < 24) return `${h}h ago`
        return `${Math.floor(h / 24)}d ago`
    })()
    return (
        <Link
            href={`/d/f/${firmSlug}/c/${item.clientSlug}/e/${item.engagementSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white"
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.documentName}</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-500 shrink-0">{item.engagementName}</span>
                </div>
                {item.lastMessage && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{item.lastMessage}</p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">{timeAgo}</span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </Link>
    )
}

function ProspectRow({ item, firmSlug }: { item: ProspectItem; firmSlug: string }) {
    const labelClass = deltaColor(item.daysUntil)
    return (
        <Link
            href={`/d/f/${firmSlug}/c/${item.clientSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white"
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.clientName}</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-500 shrink-0">Prospect Follow-up</span>
                </div>
                <p className="text-xs text-gray-400 truncate">
                    {item.expectedCloseDate
                        ? `Expected close: ${new Date(item.expectedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : 'Follow-up due'}
                </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${labelClass}`}>
                    {formatDelta(item.daysUntil)}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </Link>
    )
}

function InviteRow({ item, firmSlug }: { item: PendingInviteItem; firmSlug: string }) {
    const labelClass = item.daysUntilExpiry <= 2 ? 'bg-red-50 text-red-700 border-red-200' : item.daysUntilExpiry <= 5 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
    return (
        <Link
            href={`/d/f/${firmSlug}/c/${item.clientSlug}/e/${item.engagementSlug}/members`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white"
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.email}</p>
                <p className="text-xs text-gray-400 truncate">{item.engagementName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${labelClass}`}>
                    {item.daysUntilExpiry <= 0 ? 'Expires today' : `Expires in ${item.daysUntilExpiry}d`}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </Link>
    )
}

function EngagementDueRow({ item, firmSlug }: { item: EngagementDueSoonItem; firmSlug: string }) {
    const labelClass = deltaColor(item.daysUntil)
    return (
        <Link
            href={`/d/f/${firmSlug}/c/${item.clientSlug}/e/${item.engagementSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white"
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.engagementName}</p>
                <p className="text-xs text-gray-400 truncate">{item.clientName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${labelClass}`}>
                    {formatDelta(item.daysUntil)}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </Link>
    )
}

function DriveAlertRow({ item, firmSlug }: { item: EngagementDriveAlert; firmSlug: string }) {
    return (
        <Link
            href={`/d/f/${firmSlug}/c/${item.clientSlug}/e/${item.engagementSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-gray-100 bg-white"
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.engagementName}</p>
                <p className="text-xs text-gray-400 truncate">{item.clientName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                    {item.count} file{item.count !== 1 ? 's' : ''}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </Link>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FirmActionCenterProps {
    firmId: string
    firmSlug: string
}

export function FirmActionCenter({ firmId, firmSlug }: FirmActionCenterProps) {
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
    const overdueEngagements = data?.engagementsDueSoon.filter(e => e.daysUntil < 0) ?? []
    // Deduplicate: exclude prospects already covered by a reminder on the same client
    const reminderClientIds = new Set(
        overdueReminders
            .filter(r => r.entityKey.startsWith('platform.clients'))
            .map(r => r.entityValue)
            .filter(Boolean)
    )
    const overdueProspects = (data?.prospects.filter(p => p.daysUntil < 0) ?? [])
        .filter(p => !reminderClientIds.has(p.clientId))
    const expiredInvites = data?.pendingInvitations.filter(i => i.daysUntilExpiry <= 0) ?? []
    const overdueCount = overdueReminders.length + overdueEngagements.length + overdueProspects.length + expiredInvites.length

    // Upcoming bucket
    const upcomingReminders = data?.upcomingReminders ?? []
    const upcomingEngagements = data?.engagementsDueSoon.filter(e => e.daysUntil >= 0) ?? []
    const pendingInvites = data?.pendingInvitations.filter(i => i.daysUntilExpiry > 0) ?? []
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

    const sharingFileCount = driveAlerts?.sharing.reduce((s, e) => s + e.count, 0) ?? 0
    const sensitiveFileCount = driveAlerts?.sensitive.reduce((s, e) => s + e.count, 0) ?? 0
    const storageFileCount = driveAlerts?.storage.reduce((s, e) => s + e.count, 0) ?? 0

    const driveViewLabel: Record<string, string> = { sharing: 'Sharing Alerts', sensitive: 'Sensitive Alerts', storage: 'Storage Alerts' }
    const driveViewCount: Record<string, number> = { sharing: sharingFileCount, sensitive: sensitiveFileCount, storage: storageFileCount }
    const driveViewBadge: Record<string, string> = { sharing: 'bg-blue-100 text-blue-700', sensitive: 'bg-orange-100 text-orange-700', storage: 'bg-purple-100 text-purple-700' }
    const isDriveView = acView === 'sharing' || acView === 'sensitive' || acView === 'storage'
    const scannedCount = driveAlerts?.scannedCount ?? 0
    const totalDriveCount = driveAlerts?.totalCount ?? 0
    const hasPartialScan = totalDriveCount > scannedCount && totalDriveCount > 0

    return (
        <div className="flex flex-col gap-3 border border-[#e5e7eb] rounded p-4 bg-[#f3f4f6] shadow-sm h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                {acView === 'summary' ? (
                    <h3 className="text-sm font-bold text-gray-900 animate-in fade-in duration-150">Action Center</h3>
                ) : (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                        <button
                            onClick={() => setAcView('summary')}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 transition-all duration-150 text-gray-700 font-medium text-xs"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </button>
                        <span className="text-sm font-bold text-gray-900">
                            {acView === 'overdue' ? 'Overdue' : acView === 'upcoming' ? 'Upcoming' : acView === 'threads' ? 'Unanswered Threads' : driveViewLabel[acView]}
                        </span>
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${acView === 'overdue' ? 'bg-red-100 text-red-700' : acView === 'upcoming' ? 'bg-amber-100 text-amber-700' : acView === 'threads' ? 'bg-purple-100 text-purple-700' : driveViewBadge[acView]}`}>
                            {acView === 'overdue' ? overdueCount : acView === 'upcoming' ? upcomingCount : acView === 'threads' ? threadsCount : driveViewCount[acView]}
                        </span>
                    </div>
                )}
                {acView === 'summary' && (
                    <button
                        onClick={() => setRefreshTick((t) => t + 1)}
                        className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div
                key={acView}
                className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto px-0.5 py-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            >
                {loading ? (
                    [1, 2, 3].map((i) => <div key={i} className="h-14 rounded bg-gray-200 animate-pulse" />)
                ) : acView === 'summary' ? (
                    <div className="flex flex-col gap-3">
                        {overdueCount === 0 && upcomingCount === 0 ? (
                            <div className="flex items-center gap-2 p-3 rounded bg-green-50 border border-green-100">
                                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                <span className="text-xs text-green-700">All caught up — no pending actions</span>
                            </div>
                        ) : (
                            <>
                                {overdueCount > 0 && (
                                    <button
                                        onClick={() => setAcView('overdue')}
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-red-100 shadow-sm hover:bg-red-50 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-red-50">
                                                <AlertCircle className="h-4 w-4 text-red-600" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-semibold text-red-700">Overdue</p>
                                                <p className="text-xs text-gray-500">{overdueSubtitle()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-lg font-bold text-red-600">{overdueCount}</span>
                                            <ChevronRight className="h-4 w-4 text-red-400" />
                                        </div>
                                    </button>
                                )}
                                {upcomingCount > 0 && (
                                    <button
                                        onClick={() => setAcView('upcoming')}
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-amber-100 shadow-sm hover:bg-amber-50 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-amber-50">
                                                <Clock className="h-4 w-4 text-amber-600" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-semibold text-amber-700">Upcoming</p>
                                                <p className="text-xs text-gray-500">{upcomingSubtitle()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-lg font-bold text-amber-600">{upcomingCount}</span>
                                            <ChevronRight className="h-4 w-4 text-amber-400" />
                                        </div>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Threads card */}
                        {threadsCount > 0 && (
                            <button
                                onClick={() => setAcView('threads')}
                                className="w-full flex items-center justify-between p-3 bg-white rounded border border-purple-100 shadow-sm hover:bg-purple-50 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-purple-50">
                                        <MessageSquare className="h-4 w-4 text-purple-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-purple-700">Unanswered Threads</p>
                                        <p className="text-xs text-gray-500">Awaiting firm response</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-lg font-bold text-purple-600">{threadsCount}</span>
                                    <ChevronRight className="h-4 w-4 text-purple-400" />
                                </div>
                            </button>
                        )}

                        {/* Document Alerts — drill-in cards */}
                        {driveLoading ? (
                            <div className="h-10 rounded bg-gray-200 animate-pulse" />
                        ) : (
                            <div className="flex flex-col gap-2 pt-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <FolderOpen className="h-4 w-4 text-gray-400" />
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Alerts</span>
                                    </div>
                                    {driveAlerts?.lastScannedAt ? (
                                        <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                            Full scan · last updated {timeAgo(driveAlerts.lastScannedAt)}
                                        </span>
                                    ) : hasPartialScan ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                                {scannedCount} of {totalDriveCount} engagements scanned
                                            </span>
                                            <button
                                                onClick={handleScanAll}
                                                disabled={isScanningAll}
                                                className="text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full border border-blue-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                                            >
                                                {isScanningAll ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : null}
                                                {isScanningAll ? 'Scanning…' : 'Scan all'}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-col gap-2">
                                    {([
                                        { key: 'sharing' as const, icon: Share2, label: 'Sharing', count: sharingFileCount, engCount: driveAlerts?.sharing.length ?? 0, active: { border: 'border-blue-100', hover: 'hover:bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-50', iconText: 'text-blue-600', chevron: 'text-blue-400', num: 'text-blue-600' } },
                                        { key: 'sensitive' as const, icon: FileWarning, label: 'Sensitive', count: sensitiveFileCount, engCount: driveAlerts?.sensitive.length ?? 0, active: { border: 'border-orange-100', hover: 'hover:bg-orange-50', text: 'text-orange-700', iconBg: 'bg-orange-50', iconText: 'text-orange-600', chevron: 'text-orange-400', num: 'text-orange-600' } },
                                        { key: 'storage' as const, icon: HardDrive, label: 'Storage', count: storageFileCount, engCount: driveAlerts?.storage.length ?? 0, active: { border: 'border-purple-100', hover: 'hover:bg-purple-50', text: 'text-purple-700', iconBg: 'bg-purple-50', iconText: 'text-purple-600', chevron: 'text-purple-400', num: 'text-purple-600' } },
                                    ]).map(({ key, icon: Icon, label, count, engCount, active }) => {
                                        const isAlert = count > 0
                                        const border = isAlert ? active.border : 'border-green-100'
                                        const hover = isAlert ? active.hover : 'hover:bg-green-50'
                                        const textColor = isAlert ? active.text : 'text-green-700'
                                        const iconBg = isAlert ? active.iconBg : 'bg-green-50'
                                        const iconText = isAlert ? active.iconText : 'text-green-600'
                                        const chevronColor = isAlert ? active.chevron : 'text-green-400'
                                        const numColor = isAlert ? active.num : 'text-green-600'
                                        const subtitle = isAlert ? `${engCount} engagement${engCount !== 1 ? 's' : ''}` : 'No alerts'
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setAcView(key)}
                                                className={`w-full flex items-center justify-between p-3 bg-white rounded border ${border} shadow-sm ${hover} hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-150`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${iconBg}`}>
                                                        <Icon className={`h-4 w-4 ${iconText}`} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className={`text-sm font-semibold ${textColor}`}>{label}</p>
                                                        <p className="text-xs text-gray-500">{subtitle}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-lg font-bold ${numColor}`}>{count}</span>
                                                    <ChevronRight className={`h-4 w-4 ${chevronColor}`} />
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : acView === 'threads' ? (
                    <div className="flex flex-col gap-4">
                        <SectionBlock title="Unanswered Client Threads" icon={MessageSquare}>
                            <div className="space-y-2">
                                {unansweredThreads.length > 0 ? unansweredThreads.map((t) => (
                                    <ThreadRow key={t.threadId} item={t} firmSlug={firmSlug} />
                                )) : (
                                    <div className="flex items-center gap-2 p-3 rounded bg-green-50 border border-green-100">
                                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                        <span className="text-xs text-green-700">No unanswered threads</span>
                                    </div>
                                )}
                            </div>
                        </SectionBlock>
                    </div>
                ) : !isDriveView && acView === 'overdue' ? (
                    <div className="flex flex-col gap-4">
                        {overdueReminders.length > 0 && (
                            <SectionBlock title="Overdue Reminders" icon={Bell}>
                                <div className="space-y-2">
                                    {overdueReminders.slice(0, 5).map((r) => (
                                        <ReminderRow key={r.id} reminder={r} onMarkDone={() => handleMarkOneDone(r.id)} isMarkingDone={markingDoneId === r.id} />
                                    ))}
                                </div>
                                <button
                                    onClick={() => handleMarkAllDone(overdueReminders)}
                                    disabled={isMarkingDone}
                                    className="w-full flex items-center justify-center gap-1.5 mt-1 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Mark all done
                                </button>
                            </SectionBlock>
                        )}
                        {overdueEngagements.length > 0 && (
                            <SectionBlock title="Overdue Engagements" icon={Briefcase}>
                                <div className="space-y-2">
                                    {overdueEngagements.slice(0, 5).map((e) => (
                                        <EngagementDueRow key={e.engagementId} item={e} firmSlug={firmSlug} />
                                    ))}
                                </div>
                            </SectionBlock>
                        )}
                        {overdueProspects.length > 0 && (
                            <SectionBlock title="Overdue Follow-ups" icon={TrendingUp}>
                                <div className="space-y-2">
                                    {overdueProspects.slice(0, 5).map((p) => (
                                        <ProspectRow key={p.clientId} item={p} firmSlug={firmSlug} />
                                    ))}
                                </div>
                            </SectionBlock>
                        )}
                        {expiredInvites.length > 0 && (
                            <SectionBlock title="Expired Invitations" icon={MailOpen}>
                                <div className="space-y-2">
                                    {expiredInvites.slice(0, 5).map((inv) => (
                                        <InviteRow key={inv.invitationId} item={inv} firmSlug={firmSlug} />
                                    ))}
                                </div>
                            </SectionBlock>
                        )}
                    </div>
                ) : acView === 'upcoming' ? (
                    <div className="flex flex-col gap-4">
                        {upcomingReminders.length > 0 && (
                            <SectionBlock title="Upcoming Reminders" icon={Bell}>
                                <div className="space-y-2">
                                    {upcomingReminders.slice(0, 5).map((r) => (
                                        <ReminderRow key={r.id} reminder={r} />
                                    ))}
                                </div>
                                <button
                                    onClick={() => handleMarkAllDone(upcomingReminders)}
                                    disabled={isMarkingDone}
                                    className="w-full flex items-center justify-center gap-1.5 mt-1 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Mark all done
                                </button>
                            </SectionBlock>
                        )}
                        {upcomingEngagements.length > 0 && (
                            <SectionBlock title="Engagement Due Dates" icon={Briefcase}>
                                <div className="space-y-2">
                                    {upcomingEngagements.slice(0, 6).map((e) => (
                                        <EngagementDueRow key={e.engagementId} item={e} firmSlug={firmSlug} />
                                    ))}
                                </div>
                            </SectionBlock>
                        )}
                        {pendingInvites.length > 0 && (
                            <SectionBlock title="Pending Invitations" icon={MailOpen}>
                                <div className="space-y-2">
                                    {pendingInvites.slice(0, 5).map((inv) => (
                                        <InviteRow key={inv.invitationId} item={inv} firmSlug={firmSlug} />
                                    ))}
                                </div>
                            </SectionBlock>
                        )}
                    </div>
                ) : isDriveView ? (
                    <div className="flex flex-col gap-4">
                        {(() => {
                            const items = acView === 'sharing' ? (driveAlerts?.sharing ?? []) : acView === 'sensitive' ? (driveAlerts?.sensitive ?? []) : (driveAlerts?.storage ?? [])
                            const icon = acView === 'sharing' ? Share2 : acView === 'sensitive' ? FileWarning : HardDrive
                            const title = acView === 'sharing' ? 'Engagements with Sharing Alerts' : acView === 'sensitive' ? 'Engagements with Sensitive Files' : 'Engagements with Large Files'
                            return items.length > 0 ? (
                                <SectionBlock title={title} icon={icon}>
                                    <div className="space-y-2">
                                        {items.map(item => (
                                            <DriveAlertRow key={item.engagementId} item={item} firmSlug={firmSlug} />
                                        ))}
                                    </div>
                                </SectionBlock>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded bg-green-50 border border-green-100">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-xs text-green-700">No alerts — all engagements look good</span>
                                </div>
                            )
                        })()}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
