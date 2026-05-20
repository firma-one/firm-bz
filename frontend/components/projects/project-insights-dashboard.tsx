'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
    MessageCircle,
    CalendarClock,
    FolderOpen,
    HardDrive,
    Users,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    FileText,
    AlertTriangle,
    Activity,
    Archive,
    BarChart2,
    FileWarning,
    ArrowUpRight,
    ArrowLeft,
    ChevronRight,
    ChevronDown,
    Clock,
    Share2,
    MailOpen,
    Check,
    Trash2,
    Heart,
    Timer,
} from 'lucide-react'
import { getFileTypeLabel, formatRelativeTime, formatFileSize } from '@/lib/utils'
import { InsightCard } from '@/components/dashboard/insight-card'
import { StatTile } from '@/components/ui/stat-tile'
import { DocumentIcon } from '@/components/ui/document-icon'
import type { EngagementInsightsResponse, UnansweredThreadItem, DocumentDueDateItem, RecentDocumentItem, SensitiveFileItem } from '@/app/api/projects/[projectId]/insights/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDocTypeBgColor(mimeType?: string): string {
    if (!mimeType) return 'bg-gray-50'
    const m = mimeType.toLowerCase()
    if (m === 'application/vnd.google-apps.folder') return 'bg-[#5A78FF]/5'
    if (m === 'application/vnd.google-apps.spreadsheet') return 'bg-green-50'
    if (m === 'application/vnd.google-apps.presentation') return 'bg-amber-50'
    if (m === 'application/vnd.google-apps.document') return 'bg-blue-50'
    if (m.includes('pdf')) return 'bg-red-50'
    if (m.includes('excel') || m.includes('spreadsheetml') || m.includes('spreadsheet')) return 'bg-green-50'
    if (m.includes('powerpoint') || m.includes('presentationml') || m.includes('presentation')) return 'bg-orange-50'
    if (m.includes('word') || m.includes('wordprocessingml') || m.includes('document')) return 'bg-blue-50'
    if (m.includes('image')) return 'bg-[#5A78FF]/5'
    if (m.includes('video')) return 'bg-red-50'
    if (m.includes('audio')) return 'bg-blue-50'
    if (m.includes('archive') || m.includes('zip')) return 'bg-yellow-50'
    return 'bg-gray-50'
}

function formatEmailName(email: string): string {
    const username = email.split('@')[0]
    return username
        .split(/[._\-+]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function deltaLabel(days: number): string {
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

function scoreColor(score: number): string {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-amber-600'
    return 'text-red-600'
}

function scoreLabel(score: number): string {
    if (score >= 80) return 'Good'
    if (score >= 60) return 'Fair'
    return 'Needs Attention'
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────


// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex items-center gap-2 p-4 rounded bg-green-50 border border-green-100">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm text-green-700">{message}</span>
        </div>
    )
}

// ─── Organization Health Card Body ───────────────────────────────────────────

function OrganizationHealthBody({ report, totalSizeBytes }: {
    report: EngagementInsightsResponse['folderHealth']
    totalSizeBytes: number
}) {
    return (
        <div>
            {/* Score ring + storage summary */}
            <div className="px-6 py-4 flex items-center gap-6 border-b border-gray-50">
                <div className="flex items-center justify-center w-16 h-16 rounded-full border-4 border-gray-100 shrink-0">
                    <span className={`text-lg font-bold ${scoreColor(report.score)}`}>{report.score}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${scoreColor(report.score)}`}>{scoreLabel(report.score)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{report.totalFolders} folders · {report.totalFiles} files · max depth {report.maxDepth}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-gray-900">{formatBytes(totalSizeBytes)}</p>
                    <p className="text-[11px] text-gray-400">Total size</p>
                </div>
            </div>

            {/* Issues list */}
            {report.issues.length === 0 ? (
                <div className="px-6 py-4">
                    <EmptyState message="Folder structure looks clean" />
                </div>
            ) : (
                <div className="divide-y divide-gray-50">
                    {report.issues.map((issue) => (
                        <div key={issue.type} className="flex items-start gap-3 px-4 py-3">
                            <div className={`p-1 rounded-md shrink-0 mt-0.5 ${issue.severity === 'warning' ? 'bg-amber-50' : 'bg-blue-50'}`}>
                                <AlertTriangle className={`h-3.5 w-3.5 ${issue.severity === 'warning' ? 'text-amber-600' : 'text-blue-500'}`} />
                            </div>
                            <span className="text-sm text-gray-700">{issue.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}



// ─── Team Status Card Body ────────────────────────────────────────────────────

function TeamStatusBody({ data }: { data: EngagementInsightsResponse }) {
    const roleLabels: Record<string, string> = {
        eng_admin: 'Admin',
        eng_member: 'Member',
        eng_ext_collaborator: 'Collaborator',
        eng_viewer: 'Viewer',
    }

    return (
        <div>
            <div className="px-6 py-4 flex items-center gap-4 border-b border-gray-50">
                <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{data.memberCount}</p>
                    <p className="text-[11px] text-gray-500">Joined</p>
                </div>
                <div className="h-8 w-px bg-gray-100" />
                <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{data.pendingInvitations.length}</p>
                    <p className="text-[11px] text-gray-500">Invited</p>
                </div>
            </div>

            {Object.entries(data.membersByRole).length > 0 && (
                <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-gray-50">
                    {Object.entries(data.membersByRole).map(([role, count]) => (
                        <span key={role} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {count} {roleLabels[role] ?? role}
                        </span>
                    ))}
                </div>
            )}

        </div>
    )
}

// ─── Shares Progress Card ────────────────────────────────────────────────────

function SharesProgressCard({ data }: { data: EngagementInsightsResponse }) {
    const sp = data.sharesProgress
    if (!sp || sp.total === 0) return null

    return (
        <div className="bg-white border border-[#e5e7eb] rounded p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Shares Board</h3>
                <span className="text-xs text-gray-400">{sp.total} share{sp.total !== 1 ? 's' : ''}</span>
            </div>
            {/* Progress bar: Done | In Progress | To Do */}
            <div className="h-2 w-full rounded-full overflow-hidden flex mb-3 bg-gray-100">
                {sp.done > 0 && <div className="bg-sky-400 h-full transition-all" style={{ width: `${(sp.done / sp.total) * 100}%` }} />}
                {sp.inProgress > 0 && <div className="bg-teal-400 h-full transition-all" style={{ width: `${(sp.inProgress / sp.total) * 100}%` }} />}
                {sp.toDo > 0 && <div className="bg-violet-200 h-full transition-all" style={{ width: `${(sp.toDo / sp.total) * 100}%` }} />}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                    <p className="text-lg font-bold text-violet-600">{sp.toDo}</p>
                    <p className="text-[10px] text-gray-400">To Do</p>
                </div>
                <div className="text-center">
                    <p className="text-lg font-bold text-teal-600">{sp.inProgress}</p>
                    <p className="text-[10px] text-gray-400">In Progress</p>
                </div>
                <div className="text-center">
                    <p className="text-lg font-bold text-sky-600">{sp.done}</p>
                    <p className="text-[10px] text-gray-400">Done</p>
                </div>
            </div>
            {(sp.finalized > 0 || sp.externalCollaborators > 0 || sp.externalViewers > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-50">
                    {sp.finalized > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{sp.finalized} finalized</span>}
                    {sp.externalCollaborators > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{sp.externalCollaborators} EC</span>}
                    {sp.externalViewers > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{sp.externalViewers} EV</span>}
                </div>
            )}
        </div>
    )
}

// ─── Action Center ───────────────────────────────────────────────────────────

function SectionBlock({ title, icon: Icon, badge, children }: { title: string; icon: React.ElementType; badge?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
                {badge && <span className="ml-auto text-[10px] font-medium text-gray-400">{badge}</span>}
            </div>
            {children}
        </div>
    )
}

function ACRow({ href, isExternal, children }: { href: string; isExternal?: boolean; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] transition-colors rounded border border-[#e5e7eb] bg-white"
        >
            {children}
        </Link>
    )
}

function ACThreadRow({ item, engagementBase }: { item: UnansweredThreadItem; engagementBase: string }) {
    const diff = Date.now() - new Date(item.lastMessageAt).getTime()
    const h = Math.floor(diff / 3600000)
    const timeAgo = h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
    return (
        <ACRow href={`${engagementBase}/comments#doc-comment:${item.documentId}`} isExternal>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.documentName}</p>
                <p className="text-xs text-gray-400 truncate">{item.lastMessagePreview || 'Client left a comment'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-gray-400">{timeAgo}</span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </ACRow>
    )
}

function ACDocDueRow({ item, engagementBase }: { item: DocumentDueDateItem; engagementBase: string }) {
    return (
        <ACRow href={`${engagementBase}/files#doc-file:${item.documentId}`} isExternal>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.documentName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${deltaColor(item.daysUntil)}`}>
                    {deltaLabel(item.daysUntil)}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </ACRow>
    )
}

function ACInviteRow({ item, engagementBase }: { item: { email: string; daysUntilExpiry: number }; engagementBase: string }) {
    const labelClass = item.daysUntilExpiry <= 0
        ? 'bg-red-50 text-red-700 border-red-200'
        : item.daysUntilExpiry <= 2
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-50 text-slate-600 border-slate-200'
    return (
        <ACRow href={`${engagementBase}/members`} isExternal>
            <p className="text-sm font-semibold text-gray-900 truncate flex-1">{item.email}</p>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${labelClass}`}>
                    {item.daysUntilExpiry <= 0 ? 'Expired' : `Expires in ${item.daysUntilExpiry}d`}
                </span>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
        </ACRow>
    )
}

function ACSensitiveRow({ item, engagementBase, onDismiss }: { item: SensitiveFileItem; engagementBase: string; onDismiss: () => void }) {
    const href = item.driveWebViewLink ?? `${engagementBase}/files#doc-file:${item.documentId}`
    return (
        <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
                <ACRow href={href} isExternal={!!item.driveWebViewLink}>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.fileName}</p>
                        {item.driveWebViewLink && <p className="text-[10px] text-gray-400">Google Drive</p>}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-gray-400 shrink-0" />
                </ACRow>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                title="Mark as reviewed"
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
                <Check className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

function ACStorageRow({ label, sub }: { label: string; sub: string }) {
    return (
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded border border-[#e5e7eb] bg-white">
            <p className="text-sm font-semibold text-gray-900 truncate flex-1">{label}</p>
            <span className="text-xs text-gray-400 shrink-0">{sub}</span>
        </div>
    )
}

function EngagementActionCenter({ data, loading, engagementBase, projectId, setRefreshTick }: {
    data: EngagementInsightsResponse | null
    loading: boolean
    engagementBase: string
    projectId: string
    setRefreshTick: React.Dispatch<React.SetStateAction<number>>
}) {
    const { session } = useAuth()
    const [acView, setAcView] = useState<'summary' | 'overdue' | 'upcoming' | 'threads' | 'sharing' | 'sensitive' | 'storage'>('summary')
    const [deleteTarget, setDeleteTarget] = useState<{ fileId: string; fileName: string; externalId: string } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showAllDuplicates, setShowAllDuplicates] = useState(false)
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
    const [reviewedSensitiveIds, setReviewedSensitiveIds] = useState<Set<string>>(new Set())

    async function handleDeleteFile() {
        if (!deleteTarget || !session?.access_token) return
        setIsDeleting(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${deleteTarget.fileId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` },
            })
            if (res.ok) {
                // Optimistically hide the file; groups with <2 remaining are filtered out at render
                setDeletedIds(prev => new Set(prev).add(deleteTarget.fileId))
                setRefreshTick((t: number) => t + 1)
            }
        } catch (err) {
            console.error('Failed to delete file', err)
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    // Overdue bucket (threads moved to own category)
    const overdueDocs = data?.documentsDueSoon.filter(d => d.daysUntil < 0) ?? []
    const expiredInvites = data?.pendingInvitations.filter(i => i.daysUntilExpiry <= 0) ?? []
    const overdueCount = overdueDocs.length + expiredInvites.length

    // Upcoming bucket
    const upcomingDocs = data?.documentsDueSoon.filter(d => d.daysUntil >= 0) ?? []
    const pendingInvites = data?.pendingInvitations.filter(i => i.daysUntilExpiry > 0) ?? []
    const engagementDueSoon = (data?.engagementDaysUntilDue != null && data.engagementDaysUntilDue >= 0 && data.engagementDaysUntilDue <= 30) ? 1 : 0
    const upcomingCount = upcomingDocs.length + pendingInvites.length + engagementDueSoon

    // Document alert categories
    const threadItems = data?.unansweredThreads ?? []
    const threadCount = threadItems.length
    const sharingItems = data?.pendingInvitations ?? []
    const sharingCount = sharingItems.length
    const sensitiveItems = (data?.sensitiveFiles ?? []).filter(f => !reviewedSensitiveIds.has(f.documentId))
    const sensitiveCount = sensitiveItems.length
    const staleItems = data?.storageHealth.staleFiles ?? []
    const largeItems = data?.storageHealth.largeFiles ?? []
    const duplicateGroups = (data?.storageHealth.duplicateGroups ?? [])
        .map(g => ({ ...g, files: g.files.filter(f => !deletedIds.has(f.documentId)) }))
        .filter(g => g.files.length >= 2)
    const duplicateCount = duplicateGroups.reduce((sum, g) => sum + g.files.length, 0)
    const storageCount = (data?.storageHealth.staleCount ?? 0) + (data?.storageHealth.largeCount ?? 0) + duplicateCount

    const overdueSubtitle = () => {
        const parts: string[] = []
        if (overdueDocs.length) parts.push(`${overdueDocs.length} doc${overdueDocs.length > 1 ? 's' : ''}`)
        if (expiredInvites.length) parts.push(`${expiredInvites.length} invite${expiredInvites.length > 1 ? 's' : ''}`)
        return parts.join(' · ')
    }

    const upcomingSubtitle = () => {
        const parts: string[] = []
        if (engagementDueSoon) parts.push('engagement end date')
        if (upcomingDocs.length) parts.push(`${upcomingDocs.length} due date${upcomingDocs.length > 1 ? 's' : ''}`)
        if (pendingInvites.length) parts.push(`${pendingInvites.length} invite${pendingInvites.length > 1 ? 's' : ''}`)
        return parts.join(' · ')
    }

    const isDrillView = acView === 'threads' || acView === 'sharing' || acView === 'sensitive' || acView === 'storage'
    const drillViewLabel: Record<string, string> = { threads: 'Threads', sharing: 'Sharing', sensitive: 'Sensitive', storage: 'Storage' }
    const drillViewCount: Record<string, number> = { threads: threadCount, sharing: sharingCount, sensitive: sensitiveCount, storage: storageCount }
    const drillViewBadge: Record<string, string> = {
        threads: 'bg-blue-100 text-blue-700',
        sharing: 'bg-indigo-100 text-indigo-700',
        sensitive: 'bg-orange-100 text-orange-700',
        storage: 'bg-[#5A78FF]/10 text-[#5A78FF]',
    }

    return (
        <div className="flex flex-col gap-3 border border-[#e5e7eb] rounded p-4 bg-[#f9f9fb]">
            {/* Header */}
            <div className="flex items-center justify-between">
                {acView === 'summary' ? (
                    <h3 className="text-sm font-bold text-gray-900 animate-in fade-in duration-150">Action Center</h3>
                ) : (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                        <button
                            onClick={() => setAcView('summary')}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#f3f4f6] hover:bg-[#e5e7eb] active:scale-95 transition-all duration-150 text-gray-700 font-medium text-xs"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </button>
                        <span className="text-sm font-bold text-gray-900">
                            {acView === 'overdue' ? 'Overdue' : acView === 'upcoming' ? 'Upcoming' : drillViewLabel[acView]}
                        </span>
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${acView === 'overdue' ? 'bg-red-100 text-red-700' : acView === 'upcoming' ? 'bg-amber-100 text-amber-700' : drillViewBadge[acView]}`}>
                            {acView === 'overdue' ? overdueCount : acView === 'upcoming' ? upcomingCount : drillViewCount[acView]}
                        </span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div
                key={acView}
                className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto px-0.5 py-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            >
                {loading ? (
                    [1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-200 animate-pulse" />)
                ) : acView === 'summary' ? (
                    <div className="flex flex-col gap-3">
                        {/* Overdue / Upcoming category cards */}
                        {overdueCount === 0 && upcomingCount === 0 ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
                                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                <span className="text-xs text-green-700">All caught up — no pending actions</span>
                            </div>
                        ) : (
                            <>
                                {overdueCount > 0 && (
                                    <button
                                        onClick={() => setAcView('overdue')}
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-red-100 hover:bg-red-50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-red-50"><AlertCircle className="h-4 w-4 text-red-600" /></div>
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
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-amber-100 hover:bg-amber-50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-amber-50"><Clock className="h-4 w-4 text-amber-600" /></div>
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

                        {/* Document Alert cards */}
                        <div className="flex flex-col gap-2 pt-1">
                            <div className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4 text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Document Alerts</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                {([
                                    { key: 'threads' as const, icon: MessageCircle, label: 'Threads', count: threadCount, sub: threadCount > 0 ? `${threadCount} unanswered thread${threadCount > 1 ? 's' : ''}` : 'No unanswered threads', active: { border: 'border-blue-100', hover: 'hover:bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-50', iconText: 'text-blue-600', chevron: 'text-blue-400', num: 'text-blue-600' } },
                                    { key: 'sharing' as const, icon: Share2, label: 'Sharing', count: sharingCount, sub: sharingCount > 0 ? `${sharingCount} invitation${sharingCount > 1 ? 's' : ''} pending` : 'No pending invites', active: { border: 'border-indigo-100', hover: 'hover:bg-indigo-50', text: 'text-indigo-700', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', chevron: 'text-indigo-400', num: 'text-indigo-600' } },
                                    { key: 'sensitive' as const, icon: FileWarning, label: 'Sensitive', count: sensitiveCount, sub: sensitiveCount > 0 ? `${sensitiveCount} file${sensitiveCount > 1 ? 's' : ''} flagged` : 'No sensitive files', active: { border: 'border-orange-100', hover: 'hover:bg-orange-50', text: 'text-orange-700', iconBg: 'bg-orange-50', iconText: 'text-orange-600', chevron: 'text-orange-400', num: 'text-orange-600' } },
                                    { key: 'storage' as const, icon: HardDrive, label: 'Storage', count: storageCount, sub: storageCount > 0 ? [data?.storageHealth.staleCount ? `${data.storageHealth.staleCount} stale` : '', data?.storageHealth.largeCount ? `${data.storageHealth.largeCount} large` : '', duplicateCount ? `${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : 'Storage looks healthy', active: { border: 'border-[#5A78FF]/20', hover: 'hover:bg-[#5A78FF]/5', text: 'text-[#5A78FF]', iconBg: 'bg-[#5A78FF]/5', iconText: 'text-[#5A78FF]', chevron: 'text-[#5A78FF]/50', num: 'text-[#5A78FF]' } },
                                ] as const).map(({ key, icon: Icon, label, count, sub, active }) => {
                                    const isAlert = count > 0
                                    const border = isAlert ? active.border : 'border-green-100'
                                    const hover = isAlert ? active.hover : 'hover:bg-green-50'
                                    const textColor = isAlert ? active.text : 'text-green-700'
                                    const iconBg = isAlert ? active.iconBg : 'bg-green-50'
                                    const iconText = isAlert ? active.iconText : 'text-green-600'
                                    const chevronColor = isAlert ? active.chevron : 'text-green-400'
                                    const numColor = isAlert ? active.num : 'text-green-600'
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setAcView(key)}
                                            className={`w-full flex items-center justify-between p-3 bg-white rounded border ${border} ${hover} hover:scale-[1.01] active:scale-[0.99] transition-all duration-150`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${iconBg}`}><Icon className={`h-4 w-4 ${iconText}`} /></div>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${textColor}`}>{label}</p>
                                                    <p className="text-xs text-gray-500">{sub}</p>
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
                    </div>
                ) : acView === 'overdue' ? (
                    <div className="flex flex-col gap-4">
                        {overdueDocs.length > 0 && (
                            <SectionBlock title="Overdue Documents" icon={CalendarClock}>
                                <div className="space-y-2">
                                    {overdueDocs.slice(0, 5).map(d => <ACDocDueRow key={d.documentId} item={d} engagementBase={engagementBase} />)}
                                </div>
                            </SectionBlock>
                        )}
                        {expiredInvites.length > 0 && (
                            <SectionBlock title="Expired Invitations" icon={MailOpen}>
                                <div className="space-y-2">
                                    {expiredInvites.slice(0, 5).map(i => <ACInviteRow key={i.email} item={i} engagementBase={engagementBase} />)}
                                </div>
                            </SectionBlock>
                        )}
                    </div>
                ) : acView === 'upcoming' ? (
                    <div className="flex flex-col gap-4">
                        {engagementDueSoon > 0 && data && (
                            <SectionBlock title="Engagement End Date" icon={CalendarClock}>
                                <div className="flex items-center justify-between gap-2 px-4 py-3 rounded border border-[#e5e7eb] bg-white">
                                    <p className="text-sm font-semibold text-gray-900 flex-1 truncate">
                                        {data.engagementDueDate
                                            ? new Date(data.engagementDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                            : 'Engagement end date'}
                                    </p>
                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${deltaColor(data.engagementDaysUntilDue!)}`}>
                                        {deltaLabel(data.engagementDaysUntilDue!)}
                                    </span>
                                </div>
                            </SectionBlock>
                        )}
                        {upcomingDocs.length > 0 && (
                            <SectionBlock title="Document Due Dates" icon={CalendarClock}>
                                <div className="space-y-2">
                                    {upcomingDocs.slice(0, 6).map(d => <ACDocDueRow key={d.documentId} item={d} engagementBase={engagementBase} />)}
                                </div>
                            </SectionBlock>
                        )}
                        {pendingInvites.length > 0 && (
                            <SectionBlock title="Pending Invitations" icon={MailOpen}>
                                <div className="space-y-2">
                                    {pendingInvites.slice(0, 5).map(i => <ACInviteRow key={i.email} item={i} engagementBase={engagementBase} />)}
                                </div>
                            </SectionBlock>
                        )}
                    </div>
                ) : isDrillView ? (
                    <div className="flex flex-col gap-4">
                        {acView === 'threads' && (
                            threadItems.length > 0 ? (
                                <SectionBlock title="Unanswered Client Threads" icon={MessageCircle}>
                                    <div className="space-y-2">
                                        {threadItems.map(t => <ACThreadRow key={t.documentId} item={t} engagementBase={engagementBase} />)}
                                    </div>
                                </SectionBlock>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-xs text-green-700">No unanswered client threads</span>
                                </div>
                            )
                        )}
                        {acView === 'sharing' && (
                            sharingItems.length > 0 ? (
                                <SectionBlock title="Pending Invitations" icon={Share2}>
                                    <div className="space-y-2">
                                        {sharingItems.slice(0, 8).map(i => <ACInviteRow key={i.email} item={i} engagementBase={engagementBase} />)}
                                    </div>
                                </SectionBlock>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-xs text-green-700">No pending invitations</span>
                                </div>
                            )
                        )}
                        {acView === 'sensitive' && (
                            sensitiveItems.length > 0 ? (
                                <SectionBlock title="Sensitive Files" icon={FileWarning}>
                                    <div className="space-y-2">
                                        {sensitiveItems.slice(0, 8).map(f => (
                                            <ACSensitiveRow
                                                key={f.documentId}
                                                item={f}
                                                engagementBase={engagementBase}
                                                onDismiss={() => setReviewedSensitiveIds(prev => new Set(prev).add(f.documentId))}
                                            />
                                        ))}
                                    </div>
                                </SectionBlock>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-xs text-green-700">No sensitive files detected</span>
                                </div>
                            )
                        )}
                        {acView === 'storage' && (
                            storageCount > 0 ? (
                                <div className="flex flex-col gap-4">
                                    {duplicateGroups.length > 0 && (
                                        <SectionBlock
                                            title={`Possible Duplicates`}
                                            icon={BarChart2}
                                            badge={`${duplicateCount} file${duplicateCount !== 1 ? 's' : ''} · ${duplicateGroups.length} group${duplicateGroups.length !== 1 ? 's' : ''}`}
                                        >
                                            <div className="space-y-2">
                                                {(showAllDuplicates ? duplicateGroups : duplicateGroups.slice(0, 5)).map(g => (
                                                    <div key={g.baseKey} className="px-4 py-3 rounded border border-[#e5e7eb] bg-white">
                                                        <p className="text-xs font-semibold text-gray-500 mb-1.5">
                                                            {g.type === 'exact' ? 'Exact size match' : `"${g.baseKey}"`}
                                                            <span className="ml-1.5 font-normal text-gray-400">· {g.files.length} files</span>
                                                        </p>
                                                        <div className="space-y-1">
                                                            {g.files.slice(0, 4).map(f => (
                                                                <div key={f.documentId} className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-xs text-gray-700 truncate">{f.fileName}</p>
                                                                        {f.folderPath && (
                                                                            <p className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
                                                                                <FolderOpen className="h-3 w-3 shrink-0 text-gray-300" />
                                                                                {f.folderPath}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setDeleteTarget({ fileId: f.documentId, fileName: f.fileName, externalId: '' })}
                                                                        className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                                                                        title="Delete file"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {g.files.length > 4 && <p className="text-[10px] text-gray-400">+{g.files.length - 4} more</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                                {duplicateGroups.length > 5 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllDuplicates(v => !v)}
                                                        className="w-full text-[11px] font-medium text-[#5A78FF] hover:text-[#3d5ce0] text-center py-1.5 rounded hover:bg-[#5A78FF]/5 transition-colors"
                                                    >
                                                        {showAllDuplicates ? 'Show less' : `Show all ${duplicateGroups.length} groups`}
                                                    </button>
                                                )}
                                            </div>
                                        </SectionBlock>
                                    )}
                                    {staleItems.length > 0 && (
                                        <SectionBlock title="Stale Files (6+ months)" icon={Archive} badge={`${data?.storageHealth.staleCount ?? staleItems.length} files`}>
                                            <div className="space-y-2">
                                                {staleItems.slice(0, 5).map(f => <ACStorageRow key={f.documentId} label={f.fileName} sub={`${f.monthsStale}mo old`} />)}
                                                {(data?.storageHealth.staleCount ?? 0) > 5 && (
                                                    <p className="text-[11px] text-gray-400 text-center py-1">Showing 5 of {data?.storageHealth.staleCount}</p>
                                                )}
                                            </div>
                                        </SectionBlock>
                                    )}
                                    {largeItems.length > 0 && (
                                        <SectionBlock title="Large Files (>50 MB)" icon={HardDrive} badge={`${data?.storageHealth.largeCount ?? largeItems.length} files`}>
                                            <div className="space-y-2">
                                                {largeItems.slice(0, 5).map(f => <ACStorageRow key={f.documentId} label={f.fileName} sub={formatBytes(f.fileSize)} />)}
                                                {(data?.storageHealth.largeCount ?? 0) > 5 && (
                                                    <p className="text-[11px] text-gray-400 text-center py-1">Showing 5 of {data?.storageHealth.largeCount}</p>
                                                )}
                                            </div>
                                        </SectionBlock>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    <span className="text-xs text-green-700">Storage looks healthy</span>
                                </div>
                            )
                        )}
                    </div>
                ) : null}
            </div>

            {/* Delete confirmation modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
                    <div className="bg-white rounded p-6 shadow-xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 mb-2">Move to Trash?</h3>
                        <p className="text-sm text-gray-500 mb-1">
                            &quot;<span className="font-medium text-gray-700">{deleteTarget.fileName}</span>&quot; will be moved to the Google Drive Trash.
                        </p>
                        <p className="text-xs text-gray-400 mb-4">It can be recovered from Trash for up to 30 days before Google permanently deletes it.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteFile}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? 'Moving to Trash…' : 'Move to Trash'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, allLabel, options, value, onChange, formatOption }: {
    label: string
    allLabel: string
    options: string[]
    value: string
    onChange: (v: string) => void
    formatOption?: (v: string) => string
}) {
    const [open, setOpen] = useState(false)
    const hasActive = !!value
    return (
        <div className="relative">
            {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium rounded transition-colors ${hasActive ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-[#e5e7eb] hover:bg-[#f3f4f6] text-gray-700'}`}
            >
                <span>{value ? (formatOption ? formatOption(value) : value) : label}</span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-[#e5e7eb] rounded shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-gray-100 mb-1 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
                        <button onClick={() => setOpen(false)} className="text-[10px] font-semibold text-white bg-gray-900 hover:bg-gray-800 px-2 py-0.5 rounded transition-colors">Done</button>
                    </div>
                    <div className="max-h-52 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                        {(['', ...options] as string[]).map((opt) => {
                            const selected = value === opt
                            const display = opt ? (formatOption ? formatOption(opt) : opt) : allLabel
                            return (
                                <button
                                    key={opt}
                                    onClick={() => { onChange(opt); setOpen(false) }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                                >
                                    <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}>
                                        {selected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className={selected ? 'font-medium text-gray-900' : ''}>{display}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Document Activity Section ────────────────────────────────────────────────

type ActivityTab = '24h' | '1w' | '1m'

const PAGE_SIZE = 10

function DocActivitySection({ data, engagementBase }: { data: EngagementInsightsResponse; engagementBase: string }) {
    const [tab, setTab] = useState<ActivityTab>('1w')
    const [typeFilter, setTypeFilter] = useState<string>('')
    const [modifiedByFilter, setModifiedByFilter] = useState<string>('')
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const allRecent = data.recentDocuments ?? []
    const now = Date.now()
    const cutoffs: Record<ActivityTab, number> = {
        '24h': now - 24 * 3600 * 1000,
        '1w': now - 7 * 24 * 3600 * 1000,
        '1m': now - 30 * 24 * 3600 * 1000,
    }

    const recentFiltered = allRecent.filter(d => new Date(d.updatedAt).getTime() >= cutoffs[tab])

    const typeOptions = Array.from(new Set(allRecent.map(d => getFileTypeLabel(d.mimeType ?? '')).filter(Boolean))).sort()
    const modifiedByOptions = Array.from(new Set(allRecent.map(d => (d as RecentDocumentItem & { updatedByEmail?: string | null }).updatedByEmail).filter((e): e is string => !!e))).sort()

    const fullList = recentFiltered
        .filter(d => !typeFilter || getFileTypeLabel(d.mimeType ?? '') === typeFilter)
        .filter(d => !modifiedByFilter || (d as RecentDocumentItem & { updatedByEmail?: string | null }).updatedByEmail === modifiedByFilter)
    const visibleList = fullList.slice(0, visibleCount)
    const hasMore = visibleCount < fullList.length

    // Reset pagination when filters/tab change
    useEffect(() => { setVisibleCount(PAGE_SIZE) }, [tab, typeFilter, modifiedByFilter])

    // Scroll-based lazy loading — fires when within 100px of the container bottom
    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return
        const handleScroll = () => {
            if (!hasMore) return
            const { scrollTop, scrollHeight, clientHeight } = container
            if (scrollHeight - scrollTop - clientHeight < 100) {
                setVisibleCount(n => n + PAGE_SIZE)
            }
        }
        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [hasMore])

    const tabLabels: Record<ActivityTab, string> = { '24h': '24h', '1w': '1 wk', '1m': '1 mo' }

    return (
        <div className="bg-white rounded border border-[#e5e7eb]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Document Activity</h3>
                    {fullList.length > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{fullList.length}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {typeOptions.length > 0 && (
                        <FilterDropdown
                            label="Type"
                            allLabel="All types"
                            options={typeOptions}
                            value={typeFilter}
                            onChange={setTypeFilter}
                        />
                    )}
                    {modifiedByOptions.length > 0 && (
                        <FilterDropdown
                            label="Modified by"
                            allLabel="All editors"
                            options={modifiedByOptions}
                            value={modifiedByFilter}
                            onChange={setModifiedByFilter}
                            formatOption={formatEmailName}
                        />
                    )}
                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                        {(['24h', '1w', '1m'] as ActivityTab[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {tabLabels[t]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {fullList.length === 0 ? (
                <div className="p-6">
                    <EmptyState message="No document changes in this period." />
                </div>
            ) : (
                <div ref={scrollContainerRef} className="overflow-y-auto max-h-[640px] divide-y divide-[#e5e7eb] [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    {visibleList.map((doc) => {
                        const d = doc as RecentDocumentItem & { folderPath?: string | null; updatedByEmail?: string | null }
                            const href = engagementBase ? `${engagementBase}/files#doc-file:${d.id}` : '#'
                            return (
                                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className={`p-2 rounded-lg shrink-0 ${getDocTypeBgColor(d.mimeType ?? undefined)}`}>
                                        <DocumentIcon mimeType={d.mimeType ?? undefined} size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 truncate">{d.fileName}</p>
                                        <p className="text-[11px] text-gray-400 truncate">
                                            {d.folderPath || (d.mimeType ? getFileTypeLabel(d.mimeType) : '')}
                                            {d.fileSize ? ` · ${formatFileSize(d.fileSize)}` : ''}
                                            {d.updatedByEmail ? ` · ${formatEmailName(d.updatedByEmail)}` : ''}
                                            {` · ${formatRelativeTime(d.updatedAt)}`}
                                        </p>
                                    </div>
                                    <Link
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 p-1 rounded-md hover:bg-gray-100 transition-colors"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <ArrowUpRight className="h-4 w-4 text-gray-400" />
                                    </Link>
                                </div>
                            )
                        })
                    }
                    {hasMore && (
                        <div className="h-8 flex items-center justify-center border-t border-gray-50">
                            <span className="text-[11px] text-gray-400">{visibleCount} of {fullList.length}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface ProjectInsightsDashboardProps {
    projectId: string
    orgSlug?: string
    clientSlug?: string
    engagementSlug?: string
}

export function ProjectInsightsDashboard({
    projectId,
    orgSlug = '',
    clientSlug = '',
    engagementSlug = '',
}: ProjectInsightsDashboardProps) {
    const { session } = useAuth()
    const [data, setData] = useState<EngagementInsightsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)

    const engagementBase = orgSlug && clientSlug && engagementSlug
        ? `/d/f/${orgSlug}/c/${clientSlug}/e/${engagementSlug}`
        : ''

    useEffect(() => {
        if (!session?.access_token) return
        setLoading(true)
        fetch(`/api/projects/${projectId}/insights`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
            .then((r) => r.json())
            .then((d) => setData(d))
            .catch((e) => console.error('Failed to load engagement insights', e))
            .finally(() => setLoading(false))
    }, [projectId, session, refreshTick])

    const dueLabel = data?.engagementDaysUntilDue != null
        ? deltaLabel(data.engagementDaysUntilDue)
        : null

    const dueBadgeColor = data?.engagementDaysUntilDue != null
        ? deltaColor(data.engagementDaysUntilDue)
        : ''

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left: outer card — all informational content */}
            <div className="p-6 flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-gray-900">Engagement Insights</h2>
                        {dueLabel && (
                            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${dueBadgeColor}`}>
                                Due: {dueLabel}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setRefreshTick((t) => t + 1)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* KPI strip — Health Score full-width first, then max 4 per row */}
                <div className={`flex flex-wrap gap-4 transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
                    {/* Health Score — full width, first */}
                    <div className="w-full">
                        {data?.healthScore ? (() => {
                            const hs = data.healthScore
                            const penalties = [...(hs.penalties ?? [])].sort((a, b) => b.points - a.points)
                            const iconClass = hs.level === 'good' ? 'bg-green-50 text-green-600' : hs.level === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                            const scoreTextClass = hs.level === 'good' ? 'text-green-600' : hs.level === 'warning' ? 'text-amber-600' : 'text-red-600'
                            const barColor = hs.level === 'good' ? 'bg-green-500' : hs.level === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                            const severityLabel = (pts: number) => pts >= 15 ? { text: 'HIGH', cls: 'bg-red-50 text-red-600 border-red-100' } : pts >= 8 ? { text: 'MED', cls: 'bg-amber-50 text-amber-600 border-amber-100' } : { text: 'LOW', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
                            const deductClass = (pts: number) => pts >= 15 ? 'text-red-600 font-bold' : pts >= 8 ? 'text-amber-600 font-semibold' : 'text-slate-400 font-medium'
                            const deliveryItem = data.sharesProgress?.total > 0
                                ? { pct: Math.round((data.sharesProgress.done / data.sharesProgress.total) * 100), total: data.sharesProgress.total, done: data.sharesProgress.done }
                                : null
                            const totalDeducted = penalties.reduce((s, p) => s + p.points, 0)
                            return (
                                <div className="bg-white rounded border border-[#e5e7eb] overflow-hidden">
                                    {/* Header */}
                                    <div className="flex items-center gap-4 px-4 pt-4 pb-3">
                                        <div className={`p-2 rounded-xl shrink-0 ${iconClass}`}>
                                            <Heart className="h-4 w-4" />
                                        </div>
                                        <div className="flex items-baseline gap-1.5">
                                            <p className={`text-3xl font-bold leading-none ${scoreTextClass}`}>{hs.score}</p>
                                            <p className="text-sm text-gray-400 font-medium">/ 100</p>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-700">Health Score</p>
                                        {/* Formula */}
                                        {totalDeducted > 0 && (
                                            <p className="text-xs text-gray-400 ml-1">
                                                <span className="font-medium text-gray-500">100</span>
                                                {' − '}
                                                <span className="font-semibold text-red-500">{totalDeducted}</span>
                                                {' = '}
                                                <span className={`font-bold ${scoreTextClass}`}>{hs.score}</span>
                                            </p>
                                        )}
                                        <div className="ml-auto flex items-center gap-3">
                                            {deliveryItem && (
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <span className="text-gray-400">Deliverables</span>
                                                    <span className={`font-bold ${deliveryItem.pct >= 80 ? 'text-green-600' : deliveryItem.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {deliveryItem.done} / {deliveryItem.total} done
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Score bar */}
                                    <div className="px-4 pb-3">
                                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${hs.score}%` }} />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[10px] text-gray-300">0</span>
                                            <span className="text-[10px] text-gray-300">50</span>
                                            <span className="text-[10px] text-gray-300">100</span>
                                        </div>
                                    </div>
                                    {/* Breakdown */}
                                    {penalties.length === 0 ? (
                                        <div className="px-4 py-3 border-t border-gray-50">
                                            <p className="text-xs text-green-600 font-medium">All clear — no deductions</p>
                                        </div>
                                    ) : (
                                        <div className="border-t border-gray-100">
                                            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-4">
                                                <div className="contents text-[10px] font-semibold uppercase tracking-wide text-gray-400 py-1.5 border-b border-gray-50">
                                                    <span />
                                                    <span className="py-1.5 border-b border-gray-50">Factor</span>
                                                    <span className="py-1.5 border-b border-gray-50">Severity</span>
                                                    <span className="py-1.5 border-b border-gray-50 text-right">Deduction</span>
                                                </div>
                                                {penalties.map((p) => {
                                                    const sev = severityLabel(p.points)
                                                    return (
                                                        <div key={p.label} className="contents text-xs">
                                                            <span className={`h-2 w-2 rounded-full shrink-0 ${p.points >= 15 ? 'bg-red-400' : p.points >= 8 ? 'bg-amber-400' : 'bg-slate-300'}`} />
                                                            <span className="py-2 text-gray-700 border-b border-gray-50">{p.label}</span>
                                                            <span className="py-2 border-b border-gray-50">
                                                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${sev.cls}`}>{sev.text}</span>
                                                            </span>
                                                            <span className={`py-2 tabular-nums text-right border-b border-gray-50 ${deductClass(p.points)}`}>−{p.points} pts</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })() : (
                            <StatTile icon={Heart} label="Health Score" count="—" colorClass="bg-gray-50 text-gray-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-[calc(25%-12px)]">
                        <StatTile
                            icon={FileText}
                            label="Total Files"
                            count={data?.storageHealth.totalFiles ?? '—'}
                            sub={data ? formatBytes(data.storageHealth.totalSizeBytes) : undefined}
                            colorClass="bg-blue-50 text-blue-600"
                        />
                    </div>
                    <div className="flex-1 min-w-[calc(25%-12px)]">
                        <StatTile
                            icon={MessageCircle}
                            label="Unanswered Comment(s)"
                            count={loading ? '—' : (data?.unansweredThreads.length ?? 0)}
                            colorClass={(data?.unansweredThreads.length ?? 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}
                        />
                    </div>
                    <div className="flex-1 min-w-[calc(25%-12px)]">
                        {(() => {
                            const overdue = loading ? null : (data?.documentsDueSoon ?? []).filter(d => d.daysUntil < 0).length
                            const upcoming = loading ? null : (data?.documentsDueSoon ?? []).filter(d => d.daysUntil >= 0).length
                            const hasOverdue = (overdue ?? 0) > 0
                            const hasUpcoming = (upcoming ?? 0) > 0
                            const iconClass = hasOverdue ? 'bg-red-50 text-red-600' : hasUpcoming ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                            return (
                                <div className="bg-white rounded p-4 border border-[#e5e7eb] shadow-sm flex items-center gap-3 h-full">
                                    <div className={`p-2.5 rounded shrink-0 ${iconClass}`}>
                                        <CalendarClock className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-gray-500 font-medium mb-1">Doc Deadlines</p>
                                        {loading ? (
                                            <p className="text-2xl font-bold text-gray-900 leading-none">—</p>
                                        ) : overdue === 0 && upcoming === 0 ? (
                                            <p className="text-xs text-green-600 font-medium">All clear</p>
                                        ) : (
                                            <div className="flex items-baseline gap-2">
                                                {hasOverdue && (
                                                    <span className="text-xl font-bold text-red-600 leading-none tabular-nums">
                                                        {overdue} <span className="text-xs font-semibold">overdue</span>
                                                    </span>
                                                )}
                                                {hasOverdue && hasUpcoming && <span className="text-gray-300 text-sm">·</span>}
                                                {hasUpcoming && (
                                                    <span className={`${hasOverdue ? 'text-base' : 'text-xl'} font-bold text-amber-600 leading-none tabular-nums`}>
                                                        {upcoming} <span className="text-xs font-semibold">due soon</span>
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                    <div className="flex-1 min-w-[calc(25%-12px)]">
                        <StatTile
                            icon={Users}
                            label="Pending Invites"
                            count={loading ? '—' : (data?.pendingInvitations.length ?? 0)}
                            colorClass="bg-[#5A78FF]/5 text-[#5A78FF]"
                        />
                    </div>
                    <div className="flex-1 min-w-[calc(25%-12px)]">
                        {(() => {
                            if (!data?.engagementDueDate) return <StatTile icon={Timer} label="Time Lapsed" count="—" colorClass="bg-gray-50 text-gray-400" />
                            const startStr = data.kickoffDate ?? data.engagementCreatedAt
                            if (!startStr) return <StatTile icon={Timer} label="Time Lapsed" count="—" colorClass="bg-gray-50 text-gray-400" />
                            const start = new Date(startStr)
                            const end = new Date(data.engagementDueDate)
                            const now = new Date()
                            const totalMs = end.getTime() - start.getTime()
                            const spentMs = now.getTime() - start.getTime()
                            const pct = totalMs > 0 ? Math.round(Math.max(0, Math.min(100, (spentMs / totalMs) * 100))) : 0
                            const daysLeft = Math.round((end.getTime() - now.getTime()) / 86400000)
                            const colorClass = pct < 60 ? 'bg-green-50 text-green-600' : pct < 85 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                            const dueStr = daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`
                            const fromLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            const sourceLabel = data.kickoffDate ? `from ${fromLabel}` : `est. from ${fromLabel}`
                            const sub = `${dueStr} · ${sourceLabel}`
                            return <StatTile icon={Timer} label="Time Lapsed" count={`${pct}%`} sub={sub} colorClass={colorClass} />
                        })()}
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 gap-6">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-6">
                        {/* Team Status + Drive Health — side by side */}
                        <InsightCard
                            title="Team Status"
                            icon={Users}
                            theme="blue"
                            count={data?.memberCount ?? 0}
                            subtext="Members & pending invitations"
                            action={
                                engagementBase ? (
                                    <Link href={`${engagementBase}/members`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold transition-colors">
                                        Manage
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                ) : undefined
                            }
                        >
                            {data && <TeamStatusBody data={data} />}
                        </InsightCard>

                        <InsightCard
                            title="Drive Health"
                            icon={FolderOpen}
                            theme="green"
                            subtext={data ? `Score: ${data.folderHealth.score}/100 — ${scoreLabel(data.folderHealth.score)} · ${formatBytes(data.storageHealth.totalSizeBytes)} total` : undefined}
                        >
                            {data && <OrganizationHealthBody report={data.folderHealth} totalSizeBytes={data.storageHealth.totalSizeBytes} />}
                        </InsightCard>

                        {/* Shares Board — full width */}
                        {data?.sharesProgress && data.sharesProgress.total > 0 && (
                            <div className="col-span-2">
                                <SharesProgressCard data={data} />
                            </div>
                        )}

                        {/* Document Activity — spans both columns */}
                        {data && (
                            <div className="col-span-2">
                                <DocActivitySection data={data} engagementBase={engagementBase} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right: Action Center */}
            <EngagementActionCenter data={data} loading={loading} engagementBase={engagementBase} projectId={projectId} setRefreshTick={setRefreshTick} />
        </div>
    )
}
