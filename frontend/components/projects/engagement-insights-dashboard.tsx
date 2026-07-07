'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
    MessagesSquare,
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
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Clock,
    Share2,
    FileUp,
    MailOpen,
    Check,
    Trash2,
    Heart,
    Timer,
    Package,
    ClipboardCheck,
    Gauge,
    Target,
    Info,
    Eye,
    ArrowRight,
    Mail,
    X,
    Download,
    FileQuestion,
    FileType,
    FolderMinus,
    FolderX,
    FolderTree,
} from 'lucide-react'
import { getFileTypeLabel, formatRelativeTime, formatFileSize } from '@/lib/utils'
import { InsightCard } from '@/components/dashboard/insight-card'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DocumentIcon } from '@/components/ui/document-icon'
import type { EngagementInsightsResponse, UnansweredThreadItem, DocumentDueDateItem, RecentDocumentItem, SensitiveFileItem, DeliverableProgress, DeliveryHealthScore, DeliverableStage, EngagementHealthScore, PlanningHygiene, CommentThreads, EngagementPace, DeliverableRevisionMetric, ApprovalCycleMetric, FirstTimeRight } from '@/app/api/projects/[projectId]/insights/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Small info-icon + Radix tooltip. Placed inline beside a label; keep tips concise.
function InfoTip({ text, ariaLabel }: { text: string; ariaLabel?: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={ariaLabel ?? 'More info'}
                    className="text-gray-300 hover:text-gray-500 transition-colors inline-flex items-center"
                    onClick={(e) => e.preventDefault()}
                >
                    <Info className="h-3 w-3" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                {text}
            </TooltipContent>
        </Tooltip>
    )
}

// Wraps a stat tile with a top-right info icon + tooltip explaining the metric.
function TileWithTip({ text, ariaLabel, children }: { text: string; ariaLabel?: string; children: React.ReactNode }) {
    return (
        <div className="relative h-full">
            {children}
            <div className="absolute top-2 right-2 z-10">
                <InfoTip text={text} ariaLabel={ariaLabel} />
            </div>
        </div>
    )
}

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

// ─── Team Status Card Body ────────────────────────────────────────────────────

function TeamStatusBody({ data }: { data: EngagementInsightsResponse }) {
    const joined = data.memberCount
    const invited = data.pendingInvitations.length
    const teamTotal = joined + invited
    const joinedPct = teamTotal > 0 ? Math.round((joined / teamTotal) * 100) : 0

    const roleEntries = Object.entries(data.membersByRole).filter(([, c]) => c > 0)
    const roleItems = roleEntries.map(([role, count]) => ({
        label: ROLE_META[role]?.label ?? role,
        hex: ROLE_META[role]?.hex ?? RING.gray,
        value: count,
    }))
    const rolesTotal = roleItems.reduce((s, r) => s + r.value, 0)

    const internalCount = roleEntries.filter(([role]) => INTERNAL_ROLES.has(role)).reduce((s, [, c]) => s + c, 0)
    const externalCount = rolesTotal - internalCount
    const internalPct = rolesTotal > 0 ? Math.round((internalCount / rolesTotal) * 100) : 0

    return (
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Ring 1 — On team vs Invited */}
            <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400" /> On Team vs Invited
                    <InfoTip ariaLabel="About On Team vs Invited" text="Share of people already joined the engagement vs those still holding pending invitations. Center shows % joined." />
                </p>
                <RingWithLegend
                    items={[
                        { label: 'On team', hex: RING.green, value: joined },
                        { label: 'Invited', hex: RING.gray, value: invited },
                    ]}
                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{teamTotal > 0 ? `${joinedPct}%` : '—'}</span>}
                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on team</span>}
                />
            </div>

            {/* Ring 2 — Distribution by Role */}
            <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400" /> Distribution by Role
                    <InfoTip ariaLabel="About Distribution by Role" text="Breakdown of joined engagement members by role: Admin (Engagement Lead) · Member · Collaborator (external) · Reviewer (external)." />
                </p>
                {rolesTotal > 0 ? (
                    <RingWithLegend
                        items={roleItems}
                        centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{rolesTotal}</span>}
                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">members</span>}
                    />
                ) : (
                    <p className="text-xs text-gray-400 py-8">No members yet</p>
                )}
            </div>

            {/* Ring 3 — Internal vs External mix */}
            <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400" /> Internal vs External
                    <InfoTip ariaLabel="About Internal vs External" text="Firm-side members (Admins + Team Members) vs client-side members (Collaborators + Reviewers). Signals whether the engagement is well-connected on both sides." />
                </p>
                {rolesTotal > 0 ? (
                    <RingWithLegend
                        items={[
                            { label: 'Internal', hex: RING.green, value: internalCount },
                            { label: 'External', hex: RING.indigo, value: externalCount },
                        ]}
                        centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{internalPct}%</span>}
                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">internal</span>}
                    />
                ) : (
                    <p className="text-xs text-gray-400 py-8">No members yet</p>
                )}
            </div>
        </div>
    )
}

// ─── Shares Progress Card ────────────────────────────────────────────────────

// ─── Donut primitive ──────────────────────────────────────────────────────────
// Reusable SVG donut. Segments stack clockwise from top. Pass `total` to render a
// gauge (single arc over a fixed 0–total scale); omit it to size arcs by their sum.
function Donut({ segments, total, size = 120, thickness = 14, trackColor = '#f1f5f9', centerTop, centerBottom }: {
    segments: { value: number; hex: string }[]
    total?: number
    size?: number
    thickness?: number
    trackColor?: string
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    const sum = total ?? segments.reduce((s, x) => s + x.value, 0)
    const R = (size - thickness) / 2
    const c = size / 2
    const C = 2 * Math.PI * R
    let acc = 0
    const arcs = sum > 0
        ? segments.filter((s) => s.value > 0).map((s) => {
            const frac = s.value / sum
            const arc = { hex: s.hex, len: frac * C, offset: -acc * C }
            acc += frac
            return arc
        })
        : []
    return (
        <div className="relative shrink-0" style={{ width: size, height: size, filter: 'drop-shadow(0 2px 3px rgba(15,23,42,0.13))' }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={c} cy={c} r={R} fill="none" stroke={trackColor} strokeWidth={thickness} />
                {arcs.map((a, i) => (
                    <circle key={i} cx={c} cy={c} r={R} fill="none" stroke={a.hex} strokeWidth={thickness}
                        strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={a.offset} />
                ))}
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

// Soft, modern pastel palette shared by all rings, anchored on Firma brand green.
const RING = {
    amber:  '#fcd34d', // amber-300
    blue:   '#5A78FF', // Firma brand blue
    indigo: '#818cf8', // indigo-400
    green:  '#069668', // Firma brand green (--primary)
    red:    '#f87171', // red-400
    gray:   '#cbd5e1', // slate-300
}

// Palette for role rings — leans on the shared RING palette so team rings match the health rings.
const ROLE_META: Record<string, { label: string; hex: string }> = {
    eng_admin:            { label: 'Admin',        hex: RING.green },   // Engagement Lead — firm side, top authority
    eng_member:           { label: 'Member',       hex: RING.blue },    // Team Member — firm side
    eng_ext_collaborator: { label: 'Collaborator', hex: RING.indigo },  // External Collaborator — client side
    eng_viewer:           { label: 'Reviewer',     hex: RING.amber },   // External Reviewer — client side
}
const INTERNAL_ROLES = new Set(['eng_admin', 'eng_member'])

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
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f3f4f6] hover:shadow-lg transition-all duration-200 rounded border border-[#e5e7eb] bg-white shadow-md"
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
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded border border-[#d1d5db] bg-white shadow-sm">
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
    const pendingSharesCount = data?.pendingApprovalSharesCount ?? 0
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
    const drillViewLabel: Record<string, string> = { threads: 'Threads', sharing: 'Invitations', sensitive: 'Sensitive', storage: 'Storage' }
    const drillViewCount: Record<string, number> = { threads: threadCount, sharing: sharingCount, sensitive: sensitiveCount, storage: storageCount }
    const drillViewBadge: Record<string, string> = {
        threads: 'bg-blue-100 text-blue-700',
        sharing: 'bg-indigo-100 text-indigo-700',
        sensitive: 'bg-orange-100 text-orange-700',
        storage: 'bg-[#5A78FF]/10 text-[#5A78FF]',
    }

    return (
        <div
            className="flex flex-col gap-3 border border-[#e5e7eb] rounded p-4 shadow-md"
            style={{
                backgroundColor: '#ffffff',
                background: [
                    'linear-gradient(135deg, rgba(243,244,246,0.3) 25%, transparent 25%) -10px 0 / 20px 20px',
                    'linear-gradient(225deg, rgba(243,244,246,0.5) 25%, transparent 25%) -10px 0 / 20px 20px',
                    'linear-gradient(315deg, rgba(243,244,246,0.3) 25%, transparent 25%) 0px 0 / 20px 20px',
                    'linear-gradient(45deg, rgba(243,244,246,0.5) 25%, #ffffff 25%) 0px 0 / 20px 20px',
                ].join(', '),
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                {acView === 'summary' ? (
                    <>
                        <h3 className="text-sm font-bold text-gray-900 animate-in fade-in duration-150">Action Center</h3>
                        <button
                            onClick={() => setRefreshTick((t: number) => t + 1)}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </>
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
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#e5e7eb] shadow-md hover:shadow-lg hover:bg-red-50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
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
                                        className="w-full flex items-center justify-between p-3 bg-white rounded border border-[#e5e7eb] shadow-md hover:shadow-lg hover:bg-amber-50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
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
                                    { key: 'threads' as const, icon: MessagesSquare, label: 'Threads', count: threadCount, sub: threadCount > 0 ? `${threadCount} unanswered thread${threadCount > 1 ? 's' : ''}` : 'No unanswered threads', active: { border: 'border-[#d1d5db]', hover: 'hover:bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-50', iconText: 'text-blue-600', chevron: 'text-blue-400', num: 'text-blue-600' } },
                                    { key: 'sharing' as const, icon: MailOpen, label: 'Invitations', count: sharingCount, sub: sharingCount > 0 ? `${sharingCount} invitation${sharingCount > 1 ? 's' : ''} pending` : 'No pending invites', active: { border: 'border-[#d1d5db]', hover: 'hover:bg-indigo-50', text: 'text-indigo-700', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', chevron: 'text-indigo-400', num: 'text-indigo-600' } },
                                    { key: 'sensitive' as const, icon: FileWarning, label: 'Sensitive', count: sensitiveCount, sub: sensitiveCount > 0 ? `${sensitiveCount} file${sensitiveCount > 1 ? 's' : ''} flagged` : 'No sensitive files', active: { border: 'border-[#d1d5db]', hover: 'hover:bg-orange-50', text: 'text-orange-700', iconBg: 'bg-orange-50', iconText: 'text-orange-600', chevron: 'text-orange-400', num: 'text-orange-600' } },
                                    { key: 'storage' as const, icon: HardDrive, label: 'Storage', count: storageCount, sub: storageCount > 0 ? [data?.storageHealth.staleCount ? `${data.storageHealth.staleCount} stale` : '', data?.storageHealth.largeCount ? `${data.storageHealth.largeCount} large` : '', duplicateCount ? `${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : 'Storage looks healthy', active: { border: 'border-[#d1d5db]', hover: 'hover:bg-blue-50', text: 'text-[#5A78FF]', iconBg: 'bg-blue-50', iconText: 'text-[#5A78FF]', chevron: 'text-[#5A78FF]/50', num: 'text-[#5A78FF]' } },
                                ] as const).map(({ key, icon: Icon, label, count, sub, active }) => {
                                    const isAlert = count > 0
                                    const border = isAlert ? active.border : 'border-[#d1d5db]'
                                    const hover = isAlert ? active.hover : 'hover:bg-green-50'
                                    const textColor = isAlert ? active.text : 'text-gray-700'
                                    const iconBg = isAlert ? active.iconBg : 'bg-green-50'
                                    const iconText = isAlert ? active.iconText : 'text-green-600'
                                    const chevronColor = isAlert ? active.chevron : 'text-gray-400'
                                    const numColor = isAlert ? active.num : 'text-gray-500'
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setAcView(key)}
                                            className={`w-full flex items-center justify-between p-3 bg-white rounded border ${border} shadow-md hover:shadow-lg ${hover} hover:scale-[1.01] active:scale-[0.99] transition-all duration-150`}
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
                                {/* Shares pending approval — links directly to Shares tab */}
                                {(() => {
                                    const isAlert = pendingSharesCount > 0
                                    const border = 'border-[#d1d5db]'
                                    const hover = isAlert ? 'hover:bg-violet-50' : 'hover:bg-green-50'
                                    const textColor = isAlert ? 'text-violet-700' : 'text-gray-700'
                                    const iconBg = isAlert ? 'bg-violet-50' : 'bg-green-50'
                                    const iconText = isAlert ? 'text-violet-600' : 'text-green-600'
                                    const chevronColor = isAlert ? 'text-violet-400' : 'text-gray-400'
                                    const numColor = isAlert ? 'text-violet-600' : 'text-gray-500'
                                    const sub = isAlert ? `${pendingSharesCount} file${pendingSharesCount > 1 ? 's' : ''} pending approval` : 'No pending approvals'
                                    return (
                                        <Link
                                            href={`${engagementBase}/shares`}
                                            className={`w-full flex items-center justify-between p-3 bg-white rounded border ${border} shadow-md hover:shadow-lg ${hover} hover:scale-[1.01] active:scale-[0.99] transition-all duration-150`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${iconBg}`}><FileUp className={`h-4 w-4 ${iconText}`} /></div>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${textColor}`}>Intake</p>
                                                    <p className="text-xs text-gray-500">{sub}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-lg font-bold ${numColor}`}>{pendingSharesCount}</span>
                                                <ChevronRight className={`h-4 w-4 ${chevronColor}`} />
                                            </div>
                                        </Link>
                                    )
                                })()}
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
                                <div className="flex items-center justify-between gap-2 px-4 py-3 rounded border border-[#d1d5db] bg-white shadow-sm">
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
                                <SectionBlock title="Unanswered Client Threads" icon={MessagesSquare}>
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
                                                    <div key={g.baseKey} className="px-4 py-3 rounded border border-[#d1d5db] bg-white shadow-sm">
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

    const RECENT_CAP = 50
    const allRecent = (data.recentDocuments ?? []).slice(0, RECENT_CAP)
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
        <div className="bg-white rounded border border-[#e5e7eb] shadow-md">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Document Activity</h3>
                    {allRecent.length > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            Recent {allRecent.length}
                        </span>
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
                <div ref={scrollContainerRef} className="overflow-y-auto max-h-[520px] divide-y divide-[#e5e7eb] [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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

// ─── Action Center V2 — Delivery Actions + Housekeeping ─────────────────────

// Scroll to a ring on click, then pulse it briefly so the user can locate what's referenced.
function scrollToRing(ringId: string) {
    const el = document.getElementById(ringId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-pulse')
    window.setTimeout(() => el.classList.remove('ring-pulse'), 1400)
}

type ActionSeverity = 'critical' | 'warning' | 'info' | 'ok'

interface ActionRowItem {
    key: string
    label: string
    count: number
    sub?: string
    href?: string                   // link to the entity (opens in engagement)
    ringId?: string                 // if set, shows a small "→ RingName" chip
    ringLabel?: string
    severity: ActionSeverity        // drives the color accent
    icon: React.ElementType
    onDrilldown?: () => void        // if set, title click opens inline drill-down instead of href
}

function ACRowV2({ item, engagementBase }: { item: ActionRowItem; engagementBase: string }) {
    const Icon = item.icon
    const sev = item.count === 0 ? 'ok' : item.severity
    const dot = sev === 'critical' ? 'bg-red-500' : sev === 'warning' ? 'bg-amber-500' : sev === 'info' ? 'bg-primary' : 'bg-gray-300'
    const numText = sev === 'critical' ? 'text-red-600' : sev === 'warning' ? 'text-amber-600' : sev === 'info' ? 'text-primary' : 'text-gray-400'
    const iconTint = sev === 'critical' ? 'bg-red-50 text-red-600' : sev === 'warning' ? 'bg-amber-50 text-amber-600' : sev === 'info' ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400'
    const drillable = !!item.onDrilldown && item.count > 0
    const linkable = !drillable && !!item.href && item.count > 0

    const TitleTag: 'a' | 'button' | 'span' = drillable ? 'button' : linkable ? 'a' : 'span'
    const titleProps: Record<string, unknown> = drillable
        ? { type: 'button', onClick: item.onDrilldown }
        : linkable
            ? { href: item.href!.startsWith('http') || !engagementBase ? item.href : `${engagementBase}${item.href}`, target: '_blank', rel: 'noopener noreferrer' }
            : {}

    return (
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
            <div className={`p-1.5 rounded-md shrink-0 ${iconTint}`}>
                <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                    <TitleTag
                        {...titleProps as any}
                        className={`text-xs font-medium truncate inline-flex items-center gap-0.5 ${drillable || linkable ? 'text-gray-800 hover:text-primary cursor-pointer group/title' : 'text-gray-500'}`}
                    >
                        <span className="truncate">{item.label}</span>
                        {drillable && (
                            <ChevronRight className="h-2.5 w-2.5 text-gray-300 group-hover/title:text-primary group-hover/title:translate-x-0.5 transition-all shrink-0" />
                        )}
                        {linkable && (
                            <ArrowUpRight className="h-2.5 w-2.5 text-gray-300 group-hover/title:text-primary group-hover/title:translate-x-0.5 group-hover/title:-translate-y-0.5 transition-all shrink-0" />
                        )}
                    </TitleTag>
                </div>
                {item.sub && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5 pl-3">{item.sub}</p>
                )}
                {item.ringId && item.count > 0 && (
                    <button
                        type="button"
                        onClick={() => scrollToRing(item.ringId!)}
                        className="mt-1 ml-3 inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-primary transition-colors group/chip"
                    >
                        {item.ringLabel ?? 'View ring'}
                        <ArrowRight className="h-2.5 w-2.5 group-hover/chip:translate-x-0.5 transition-transform" />
                    </button>
                )}
            </div>
            <span className={`text-sm font-bold tabular-nums shrink-0 ${numText}`}>{item.count}</span>
        </div>
    )
}

// ─── Duplicate files drill-down panel ─────────────────────────────────────────

function DuplicatesDrilldown({ groups, engagementBase, onBack }: {
    groups: import('@/app/api/projects/[projectId]/insights/route').DuplicateGroup[]
    engagementBase: string
    onBack: () => void
}) {
    return (
        <div className="flex flex-col gap-0">
            {/* Panel header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors group/back"
                >
                    <ChevronLeft className="h-3.5 w-3.5 group-hover/back:-translate-x-0.5 transition-transform" />
                    Back
                </button>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs font-semibold text-gray-700">Duplicate files</span>
                <span className="ml-auto text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                    {groups.reduce((s, g) => s + g.files.length, 0)} files · {groups.length} {groups.length === 1 ? 'group' : 'groups'}
                </span>
            </div>

            {/* Groups list */}
            <div className="flex flex-col divide-y divide-gray-50 mt-1">
                {groups.map((g, gi) => (
                    <div key={g.baseKey} className="py-2.5 flex flex-col gap-1.5">
                        {/* Group label */}
                        <div className="flex items-center gap-1.5 px-1">
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                                Group {gi + 1}
                            </span>
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                g.type === 'exact'
                                    ? 'text-red-600 bg-red-50 border-red-100'
                                    : 'text-amber-600 bg-amber-50 border-amber-100'
                            }`}>
                                {g.type === 'exact' ? 'Exact match' : 'Name match'}
                            </span>
                        </div>
                        {/* Files in group */}
                        {g.files.map((f) => (
                            <div key={f.documentId} className="flex items-start gap-2 px-1 py-1 rounded hover:bg-gray-50 transition-colors group/file">
                                <FileText className="h-3.5 w-3.5 text-gray-300 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-gray-700 truncate" title={f.fileName}>{f.fileName}</p>
                                    {f.folderPath && (
                                        <p className="text-[9px] text-gray-400 truncate mt-0.5" title={f.folderPath}>{f.folderPath}</p>
                                    )}
                                </div>
                                <a
                                    href={`${engagementBase}/files`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-gray-300 hover:text-primary transition-colors opacity-0 group-hover/file:opacity-100"
                                    title="View in Files"
                                >
                                    <ArrowUpRight className="h-3 w-3" />
                                </a>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

function ACSectionV2({ title, icon: Icon, items, engagementBase, headerAction }: {
    title: string
    icon: React.ElementType
    items: ActionRowItem[]
    engagementBase: string
    headerAction?: React.ReactNode
}) {
    // Non-zero items on top, zeros at the bottom.
    const sorted = [...items].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.count - a.count)
    const attentionCount = items.filter((i) => i.count > 0).length

    return (
        <div className="border border-[#e5e7eb] rounded bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex-1">{title}</span>
                {attentionCount > 0 ? (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                        {attentionCount} to review
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> All clear
                    </span>
                )}
                {headerAction}
            </div>
            <div className="p-1 flex flex-col">
                {sorted.map((it) => <ACRowV2 key={it.key} item={it} engagementBase={engagementBase} />)}
            </div>
        </div>
    )
}

function EngagementActionCenterV2({ data, loading, engagementBase, setRefreshTick }: {
    data: EngagementInsightsResponse | null
    loading: boolean
    engagementBase: string
    projectId: string
    setRefreshTick: React.Dispatch<React.SetStateAction<number>>
}) {
    const [drilldown, setDrilldown] = useState<'duplicates' | null>(null)

    // Derived counts — kept close to source of truth in EngagementInsightsResponse.
    const overdueCount = (data?.deliverables ?? []).filter((d) => d.isOverdue).length
    const inReviewCount = (data?.deliverables ?? []).filter((d) => d.stage === 'in_review').length
    const inFlightIds = new Set((data?.deliverables ?? []).filter((d) => d.stage !== 'approved').map((d) => d.id))
    const reworkedInFlight = (data?.revisionMetrics ?? []).filter((r) => inFlightIds.has(r.documentId) && r.revisions >= 1)
    const reworkedCount = reworkedInFlight.length
    const ph = data?.planningHygiene
    const planningGaps = ph
        ? Math.max(0, (ph.deliverableTotal - ph.deliverableWithDueDate) + (ph.docTotal - ph.docWithDueDate) + (ph.docTotal - ph.docWithAssignee))
        : 0
    const threadsCount = data?.unansweredThreads.length ?? 0
    const intakeCount = data?.pendingApprovalSharesCount ?? 0
    const pendingInvitesCount = data?.pendingInvitations.length ?? 0

    const duplicatesCount = data?.storageHealth.duplicateCount ?? 0
    const staleCount = data?.storageHealth.staleCount ?? 0
    const largeCount = data?.storageHealth.largeCount ?? 0
    const badlyNamedCount = data?.storageHealth.badlyNamedCount ?? 0
    const sensitiveCount = data?.sensitiveFiles.length ?? 0
    const emptyFoldersCount = data?.folderHealth.emptyFolders ?? 0
    const orphanedFilesCount = data?.folderHealth.orphanedFiles ?? 0
    const deepFoldersCount = data?.folderHealth.deeplyNestedFolders ?? 0

    const delivery: ActionRowItem[] = [
        { key: 'overdue', label: 'Overdue deliverables', count: overdueCount, severity: 'critical', icon: AlertTriangle,
          sub: overdueCount > 0 ? 'past due date, not yet approved' : 'nothing overdue',
          href: '/board', ringId: 'ring-schedule', ringLabel: 'Delivery Schedule' },
        { key: 'in-review', label: 'In review — awaiting approval', count: inReviewCount, severity: 'info', icon: Eye,
          sub: inReviewCount > 0 ? 'ready for your review' : undefined,
          href: '/board', ringId: 'ring-status', ringLabel: 'Delivery Status' },
        { key: 'reworked', label: 'Awaiting rework', count: reworkedCount, severity: 'warning', icon: RefreshCw,
          sub: reworkedCount > 0 ? `${reworkedInFlight.reduce((s, r) => s + r.revisions, 0)} backward transitions` : undefined,
          href: '/board', ringId: 'ring-ftr', ringLabel: 'First-Time-Right' },
        { key: 'planning', label: 'Planning gaps', count: planningGaps, severity: 'warning', icon: ClipboardCheck,
          sub: planningGaps > 0 ? 'missing due dates or assignees' : undefined,
          href: '/board', ringId: 'ring-planning', ringLabel: 'Planning Hygiene' },
        { key: 'threads', label: 'Unanswered comments', count: threadsCount, severity: 'warning', icon: MessagesSquare,
          sub: threadsCount > 0 ? 'client waiting on a reply' : undefined,
          href: '/comments', ringId: 'ring-comments', ringLabel: 'Comment Responsiveness' },
        { key: 'intake', label: 'Intake awaiting review', count: intakeCount, severity: 'info', icon: MailOpen,
          sub: intakeCount > 0 ? 'files submitted by clients' : undefined,
          href: '/board' },
        { key: 'invites', label: 'Pending invitations', count: pendingInvitesCount, severity: 'info', icon: Users,
          sub: pendingInvitesCount > 0 ? 'awaiting acceptance' : undefined,
          href: '/members' },
    ]

    const housekeeping: ActionRowItem[] = [
        { key: 'sensitive', label: 'Sensitive files', count: sensitiveCount, severity: 'critical', icon: FileWarning,
          sub: sensitiveCount > 0 ? 'flagged by content pattern' : undefined,
          href: '/files' },
        { key: 'poorly-named', label: 'Poorly named files', count: badlyNamedCount, severity: 'warning', icon: FileType,
          sub: badlyNamedCount > 0 ? 'default or meaningless file names' : undefined,
          href: '/files' },
        { key: 'duplicates', label: 'Duplicate files', count: duplicatesCount, severity: 'warning', icon: FileWarning,
          sub: duplicatesCount > 0 ? '≥90% name match, same extension' : undefined,
          onDrilldown: duplicatesCount > 0 ? () => setDrilldown('duplicates') : undefined },
        { key: 'stale', label: 'Stale files', count: staleCount, severity: 'warning', icon: Archive,
          sub: staleCount > 0 ? 'not modified in 6+ months' : undefined,
          href: '/files' },
        { key: 'large', label: 'Large files', count: largeCount, severity: 'warning', icon: HardDrive,
          sub: largeCount > 0 ? 'over 50 MB' : undefined,
          href: '/files' },
        { key: 'orphaned', label: 'Orphaned files', count: orphanedFilesCount, severity: 'info', icon: FileQuestion,
          sub: orphanedFilesCount > 0 ? 'files with no parent folder' : undefined,
          href: '/files' },
        { key: 'empty-folders', label: 'Empty folders', count: emptyFoldersCount, severity: 'info', icon: FolderMinus,
          sub: emptyFoldersCount > 0 ? 'folders with no contents' : undefined,
          href: '/files' },
        { key: 'deep-folders', label: 'Deep folder nesting', count: deepFoldersCount, severity: 'info', icon: FolderTree,
          sub: deepFoldersCount > 0 ? 'folders > 3 levels deep' : undefined,
          href: '/files' },
    ]

    return (
        <div className="sticky top-4">
            <div className="bg-white border border-[#e5e7eb] rounded p-6 flex flex-col gap-6 shadow-md">
                {/* Header — mirrors the Engagement Insights card header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Action Center</h2>
                    <button
                        onClick={() => setRefreshTick((t) => t + 1)}
                        className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col gap-4">
                        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
                        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
                    </div>
                ) : drilldown === 'duplicates' ? (
                    <DuplicatesDrilldown
                        groups={data?.storageHealth.duplicateGroups ?? []}
                        engagementBase={engagementBase}
                        onBack={() => setDrilldown(null)}
                    />
                ) : (
                    <div className="flex flex-col gap-4">
                        <ACSectionV2 title="Delivery Actions" icon={Package} items={delivery} engagementBase={engagementBase} />
                        <ACSectionV2 title="Housekeeping" icon={Archive} items={housekeeping} engagementBase={engagementBase} />
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes ring-pulse-kf { 0% { background-color: rgba(var(--primary-rgb), 0); } 30% { background-color: rgba(var(--primary-rgb), 0.10); } 100% { background-color: rgba(var(--primary-rgb), 0); } }
                .ring-pulse { animation: ring-pulse-kf 1.4s ease-out; border-radius: 12px; }
            `}</style>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Deliverables Analytics (Phase 7 & 8) ─────────────────────────────────────

const DELIVERABLE_STAGE_META: Record<DeliverableStage, { label: string; hex: string }> = {
    to_do:       { label: 'To Do',       hex: RING.amber },
    in_progress: { label: 'In Progress', hex: RING.blue },
    in_review:   { label: 'In Review',   hex: RING.indigo },
    approved:    { label: 'Approved',    hex: RING.green },
}
const DELIVERABLE_STAGES: DeliverableStage[] = ['to_do', 'in_progress', 'in_review', 'approved']

// Donut + labelled legend + total row. Used for the Delivery Status / Schedule rings.
function RingWithLegend({ items, total, centerTop, centerBottom, size = 108 }: {
    items: { label: string; hex: string; value: number }[]
    total?: number
    centerTop: React.ReactNode
    centerBottom: React.ReactNode
    size?: number
}) {
    const sum = total ?? items.reduce((s, i) => s + i.value, 0)
    return (
        <div className="flex flex-col items-center gap-3 w-full">
            <Donut size={size} segments={items.map((i) => ({ value: i.value, hex: i.hex }))} total={total} centerTop={centerTop} centerBottom={centerBottom} />
            <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                {items.map((i) => (
                    <div key={i.label} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: i.hex }} />
                        <span className="text-gray-600 truncate">{i.label}</span>
                        <span className="ml-auto font-semibold text-gray-800 tabular-nums">{i.value}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2 text-xs pt-1.5 mt-0.5 border-t border-gray-100">
                    <span className="text-gray-500">Total</span>
                    <span className="ml-auto font-semibold text-gray-800 tabular-nums">{sum}</span>
                </div>
            </div>
        </div>
    )
}

// Concentric progress rings — each ring (outer→inner) fills to its coverage %.
function ConcentricRings({ rings, size = 128, centerTop, centerBottom }: {
    rings: { pct: number; hex: string }[]
    size?: number
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    const c = size / 2
    const thickness = 8
    const gap = 7
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                {rings.map((r, i) => {
                    const R = size / 2 - thickness / 2 - i * (thickness + gap)
                    const C = 2 * Math.PI * R
                    const arc = Math.max(0, Math.min(1, r.pct / 100)) * C
                    return (
                        <g key={i}>
                            <circle cx={c} cy={c} r={R} fill="none" stroke="#e9ecf1" strokeWidth={thickness} />
                            {arc > 0 && (
                                <circle cx={c} cy={c} r={R} fill="none" stroke={r.hex} strokeWidth={thickness} strokeDasharray={`${arc} ${C}`} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 1.5px rgba(15,23,42,0.28))' }} />
                            )}
                        </g>
                    )
                })}
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

function PlanningGapRow({ hex, label, missing, total }: { hex: string; label: string; missing: number; total: number }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
            <span className="text-gray-600 truncate flex-1">{label}</span>
            <span className={`shrink-0 font-medium tabular-nums ${missing > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{missing}/{total} not set</span>
        </div>
    )
}

// ─── Delivery Timeline — 8th visual in Engagement Health ─────────────────────
// Horizontal Gantt-style view: one row per deliverable, bar spans createdAt → dueDate,
// fill length = stage progress (25/50/75/100%), "today" vertical marker, x-axis auto-fits.
const STAGE_FILL_PCT: Record<DeliverableStage, number> = { to_do: 25, in_progress: 50, in_review: 75, approved: 100 }

const DAY_MS = 24 * 60 * 60 * 1000

// Enrich each deliverable with the bar's effective start/end and whether it is open-ended.
// Rules:
//   - Approved, no dueDate → end = finalizedAt (or today as fallback)
//   - In-flight, no dueDate → end = today, isOpenEnded = true (bar shows "ongoing")
//   - Any deliverable with dueDate → end = dueDate (standard)
function enrichDeliverable(d: DeliverableProgress, nowMs: number) {
    const isApproved = d.stage === 'approved'
    const isOpenEnded = !d.dueDate && !isApproved
    const endDate: string | null = d.dueDate
        ?? (isApproved ? (d.finalizedAt ?? null) : null)
    const effectiveEndMs = endDate ? new Date(endDate).getTime() : nowMs
    const startMs = d.createdAt ? new Date(d.createdAt).getTime() : nowMs
    return { ...d, isOpenEnded, endDate, effectiveEndMs, barStartMs: startMs }
}

function DeliveryTimeline({ deliverables, engagementCreatedAt, kickoffDate, engagementDueDate }: {
    deliverables: DeliverableProgress[]
    engagementCreatedAt: string | null
    kickoffDate: string | null
    engagementDueDate: string | null
}) {
    const [zoomWindow, setZoomWindow] = useState<'full' | '30d' | '90d'>('full')

    if (deliverables.length === 0) return null

    const nowMs = Date.now()
    const enriched = deliverables.map((d) => enrichDeliverable(d, nowMs))

    // Auto-fit x-axis: min → max across engagement horizon + all deliverable dates.
    const candidateMs = [
        engagementCreatedAt, kickoffDate, engagementDueDate,
        ...enriched.flatMap((d) => [d.createdAt, d.dueDate, d.finalizedAt]),
    ].filter((v): v is string => !!v).map((v) => new Date(v).getTime())
    candidateMs.push(nowMs)
    const fullMinMs = Math.min(...candidateMs)
    const fullMaxMs = Math.max(...candidateMs)

    // Apply zoom window to constrain the visible axis.
    const windowDays = zoomWindow === '30d' ? 15 : zoomWindow === '90d' ? 45 : null
    const minMs = windowDays !== null ? nowMs - windowDays * DAY_MS : fullMinMs
    const maxMs = windowDays !== null ? nowMs + windowDays * DAY_MS : fullMaxMs
    const spanMs = Math.max(1, maxMs - minMs)
    const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - minMs) / spanMs) * 100))

    // 3-tick x-axis labels: start, middle, end.
    const midMs = minMs + spanMs / 2
    const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const todayPct = pct(nowMs)

    // Engagement due date marker
    const engDueMs = engagementDueDate ? new Date(engagementDueDate).getTime() : null
    const engDuePct = engDueMs !== null ? pct(engDueMs) : null
    const engDueInWindow = engDuePct !== null && engDuePct > 0 && engDuePct < 100
    const engDuePast = engDueMs !== null && engDueMs < nowMs
    const engDueSoon = engDueMs !== null && !engDuePast && (engDueMs - nowMs) < 14 * DAY_MS
    const engDueColor = engDuePast ? RING.red : engDueSoon ? RING.amber : RING.blue

    // All deliverables are shown; sort by effective end (nearest first).
    // In zoomed mode, hide bars entirely outside the visible window.
    const rows = [...enriched]
        .sort((a, b) => a.effectiveEndMs - b.effectiveEndMs)
        .filter((d) => {
            if (windowDays === null) return true
            return d.effectiveEndMs >= minMs && d.barStartMs <= maxMs
        })

    // Nudge count: in-flight deliverables still missing a due date
    const noDueDateCount = enriched.filter((d) => d.isOpenEnded).length

    return (
        <div className="col-span-full flex flex-col gap-4 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-gray-400" /> Delivery Timeline
                    <InfoTip ariaLabel="About Delivery Timeline" text="Each bar spans from when the deliverable was created to its due date (or approved date). Bar fill shows stage progress: 25% To Do · 50% In Progress · 75% In Review · 100% Approved. Dashed bars have no due date set — they extend to today. The dashed vertical line is today; the solid vertical line is the engagement due date." />
                </p>
                {/* Zoom range selector — mirrors stock chart UX */}
                <div className="flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 p-0.5">
                    {(['30d', '90d', 'full'] as const).map((w) => (
                        <button
                            key={w}
                            onClick={() => setZoomWindow(w)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                                zoomWindow === w
                                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {w === 'full' ? 'All' : w.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Timeline chart */}
            {rows.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {rows.map((d) => {
                        const barLeft = pct(d.barStartMs)
                        const barRight = pct(d.effectiveEndMs)
                        const barWidth = Math.max(1, barRight - barLeft)
                        const meta = DELIVERABLE_STAGE_META[d.stage]
                        const fillPct = STAGE_FILL_PCT[d.stage]
                        const fillColor = d.isOverdue ? RING.red : meta.hex
                        const dueDatePct = d.dueDate ? pct(new Date(d.dueDate).getTime()) : null

                        // Right-label: show the anchor date in small text below stage label
                        const anchorLabel = d.dueDate
                            ? `Due ${fmt(new Date(d.dueDate).getTime())}`
                            : d.stage === 'approved' && d.finalizedAt
                                ? `Approved ${fmt(new Date(d.finalizedAt).getTime())}`
                                : 'No due date'

                        return (
                            <div key={d.id} className="flex items-center gap-4">
                                {/* Label */}
                                <div className="flex items-center gap-1.5 w-44 shrink-0 min-w-0">
                                    {d.docId && (
                                        <span className="font-mono text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm shrink-0">
                                            {d.docId}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-700 truncate" title={d.name}>{d.name}</span>
                                </div>

                                {/* Bar track */}
                                <div className="relative flex-1 h-7">
                                    {/* Full-width track lane */}
                                    <div className="absolute inset-0 rounded bg-gray-50/80" />
                                    {/* Engagement due date marker — solid line */}
                                    {engDueInWindow && (
                                        <div
                                            className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                                            style={{ left: `${engDuePct}%`, backgroundColor: engDueColor }}
                                            title={`Engagement due: ${fmt(engDueMs!)}`}
                                        />
                                    )}
                                    {/* Today marker — dashed line */}
                                    <div
                                        className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 pointer-events-none z-10"
                                        style={{ left: `${todayPct}%` }}
                                    />
                                    {/* Bar outer shell: full extent with tinted stage background */}
                                    <div
                                        className={`absolute top-1.5 bottom-1.5 rounded overflow-hidden ${d.isOpenEnded ? 'border border-dashed border-amber-300' : 'border border-gray-200'}`}
                                        style={{
                                            left: `${barLeft}%`,
                                            width: `${barWidth}%`,
                                            backgroundColor: `${fillColor}18`,
                                        }}
                                        title={`${d.docId ?? ''} ${d.name} · ${meta.label} · ${anchorLabel}`}
                                    >
                                        {/* Stage-progress fill (solid portion) */}
                                        <div
                                            className="h-full"
                                            style={{ width: `${fillPct}%`, backgroundColor: fillColor, opacity: 0.78 }}
                                        />
                                        {/* Open-ended fade on right edge */}
                                        {d.isOpenEnded && (
                                            <div
                                                className="absolute inset-y-0 right-0 w-5 pointer-events-none"
                                                style={{ background: `linear-gradient(to right, transparent, ${fillColor}30)` }}
                                            />
                                        )}
                                    </div>
                                    {/* Overdue accent — thin red tick at the due-date position */}
                                    {d.isOverdue && dueDatePct !== null && (
                                        <div
                                            className="absolute top-0 bottom-0 w-0.5 z-30"
                                            style={{ left: `${dueDatePct}%`, backgroundColor: RING.red }}
                                            title="Overdue"
                                        />
                                    )}
                                </div>

                                {/* Right meta */}
                                <div className="w-32 shrink-0 text-right flex flex-col items-end gap-0">
                                    <span className={`text-[11px] font-semibold leading-tight ${
                                        d.isOverdue ? 'text-red-600' : d.isOpenEnded ? 'text-amber-600' : 'text-gray-600'
                                    }`}>
                                        {meta.label}
                                    </span>
                                    <span className={`text-[10px] leading-tight ${d.isOpenEnded ? 'text-amber-500' : 'text-gray-400'}`}>
                                        {anchorLabel}
                                    </span>
                                </div>
                            </div>
                        )
                    })}

                    {/* X-axis ticks */}
                    {(() => {
                        // Collision detection: if "today" and "Eng. due" labels are within 8% of
                        // each other, stagger "Eng. due" to the second row to prevent overlap.
                        const collision = engDueInWindow && engDuePct !== null
                            && Math.abs(todayPct - engDuePct) < 8
                        return (
                            <div className="flex items-center gap-4 mt-1">
                                <div className="w-44 shrink-0" />
                                <div className={`relative flex-1 text-[10px] text-gray-400 ${collision ? 'h-9' : 'h-5'}`}>
                                    <span className="absolute left-0 top-0">{fmt(minMs)}</span>
                                    <span className="absolute left-1/2 -translate-x-1/2 top-0">{fmt(midMs)}</span>
                                    <span className="absolute right-0 top-0">{fmt(maxMs)}</span>
                                    {/* Today label — always on row 0 */}
                                    <span
                                        className="absolute top-0 text-[10px] font-medium text-primary whitespace-nowrap"
                                        style={{ left: `${todayPct}%`, transform: 'translateX(-50%)' }}
                                    >
                                        today
                                    </span>
                                    {/* Engagement due date label — row 0 normally, row 1 on collision */}
                                    {engDueInWindow && engDueMs !== null && (
                                        <span
                                            className="absolute text-[10px] font-medium whitespace-nowrap"
                                            style={{
                                                left: `${engDuePct}%`,
                                                top: collision ? '18px' : '0px',
                                                transform: 'translateX(-50%)',
                                                color: engDueColor,
                                            }}
                                        >
                                            Eng. due
                                        </span>
                                    )}
                                </div>
                                <div className="w-32 shrink-0" />
                            </div>
                        )
                    })()}
                </div>
            ) : (
                <p className="text-xs text-gray-400 py-2">No deliverables in this window.</p>
            )}

            {/* Nudge: in-flight items without a due date */}
            {noDueDateCount > 0 && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                    {noDueDateCount} deliverable{noDueDateCount > 1 ? 's' : ''} {noDueDateCount > 1 ? 'have' : 'has'} no due date — {noDueDateCount > 1 ? 'their bars extend' : 'its bar extends'} to today. Add a due date to schedule {noDueDateCount > 1 ? 'them' : 'it'} and lift Planning Hygiene.
                </p>
            )}
        </div>
    )
}

// ─── File Organization card body ─────────────────────────────────────────────
function FolderHealthRing({ label, tooltip, icon: Icon, segments, centerTop, centerBottom }: {
    label: string
    tooltip: string
    icon: React.ElementType
    // Each segment: shown in ring + legend. Pass bad segments first, ok last.
    segments: { legendLabel: string; hex: string; value: number; isIssue?: boolean }[]
    centerTop: React.ReactNode
    centerBottom: React.ReactNode
}) {
    const total = segments.reduce((s, i) => s + i.value, 0)
    // If all values are 0, show a flat gray track
    const donutSegments = total === 0
        ? [{ value: 1, hex: RING.gray }]
        : segments.filter((s) => s.value > 0).map((s) => ({ value: s.value, hex: s.hex }))

    return (
        <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-gray-400" />
                {label}
                <InfoTip ariaLabel={`About ${label}`} text={tooltip} />
            </p>
            <Donut
                size={108}
                thickness={13}
                segments={donutSegments}
                total={total === 0 ? 1 : total}
                centerTop={centerTop}
                centerBottom={centerBottom}
            />
            <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                {segments.map((s) => (
                    <div key={s.legendLabel} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.value === 0 && !s.isIssue ? RING.gray : s.hex }} />
                        <span className="text-gray-600 truncate">{s.legendLabel}</span>
                        <span className="ml-auto font-semibold text-gray-800 tabular-nums">{s.value}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2 text-xs pt-1.5 mt-0.5 border-t border-gray-100">
                    <span className="text-gray-500">Total</span>
                    <span className="ml-auto font-semibold text-gray-800 tabular-nums">{total}</span>
                </div>
            </div>
        </div>
    )
}

function FolderHealthBody({ storageHealth, folderHealth }: {
    storageHealth: EngagementInsightsResponse['storageHealth']
    folderHealth: EngagementInsightsResponse['folderHealth']
}) {
    const score = folderHealth.score
    const scoreHex = score >= 80 ? RING.green : score >= 50 ? RING.amber : RING.red
    const scoreTextClass = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
    const label = scoreLabel(score)
    const penalties = [...(folderHealth.penalties ?? [])].sort((a, b) => b.points - a.points)
    const totalDeducted = penalties.reduce((s, p) => s + p.points, 0)

    const severityLabel = (pts: number) => pts >= 15 ? { text: 'HIGH', cls: 'bg-red-50 text-red-600 border-red-100' } : pts >= 8 ? { text: 'MED', cls: 'bg-amber-50 text-amber-600 border-amber-100' } : { text: 'LOW', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    const deductClass = (pts: number) => pts >= 15 ? 'text-red-600 font-bold' : pts >= 8 ? 'text-amber-600 font-semibold' : 'text-slate-400 font-medium'

    const totalArtifacts = storageHealth.totalFiles + folderHealth.totalFolders
    const totalFiles = storageHealth.totalFiles
    const totalFolders = folderHealth.totalFolders

    const ragText = (n: number) => n > 0 ? 'text-amber-600' : 'text-gray-400'

    // 8 KPI rings — order determines grid position (score ring is cell 1, these fill cells 2–9)
    // Row 1: Score | Total Artifacts | Poorly Named
    // Row 2: Duplicates | Empty Folders | Folders > 3L depth
    // Row 3: Orphaned Files | Stale Files | Large Files
    const rings = [
        {
            label: 'Total Artifacts',
            tooltip: `All files and folders indexed. ${totalFiles} files + ${totalFolders} folders = ${totalArtifacts} total.`,
            icon: FileText,
            segments: [
                { legendLabel: 'Files', hex: RING.blue, value: totalFiles },
                { legendLabel: 'Folders', hex: RING.indigo, value: totalFolders },
            ],
            centerTop: <span className="text-xl font-bold leading-none text-gray-700 tabular-nums">{totalArtifacts}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">total</span>,
        },
        {
            label: 'Poorly Named',
            tooltip: 'Files or folders with default/meaningless names like "Untitled", "New File", "Copy of", etc.',
            icon: FileType,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: storageHealth.badlyNamedCount, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalArtifacts - storageHealth.badlyNamedCount },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(storageHealth.badlyNamedCount)}`}>{storageHealth.badlyNamedCount}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalArtifacts}</span>,
        },
        {
            label: 'Duplicates',
            tooltip: 'Files with identical or near-identical names (≥90% match) and the same extension.',
            icon: FileWarning,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: storageHealth.duplicateCount, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalArtifacts - storageHealth.duplicateCount },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(storageHealth.duplicateCount)}`}>{storageHealth.duplicateCount}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalArtifacts}</span>,
        },
        {
            label: 'Empty Folders',
            tooltip: 'Folders with no files or subfolders inside. Remove them to keep the structure clean.',
            icon: FolderMinus,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: folderHealth.emptyFolders, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalFolders - folderHealth.emptyFolders },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(folderHealth.emptyFolders)}`}>{folderHealth.emptyFolders}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalFolders}</span>,
        },
        {
            label: 'Folders > 3L depth',
            tooltip: 'Folders nested more than 3 levels deep. A shallow structure is easier to navigate — aim to keep depth at 3 or fewer.',
            icon: FolderTree,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: folderHealth.deeplyNestedFolders, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalFolders - folderHealth.deeplyNestedFolders },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(folderHealth.deeplyNestedFolders)}`}>{folderHealth.deeplyNestedFolders}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalFolders}</span>,
        },
        {
            label: 'Orphaned Files',
            tooltip: 'Files sitting at the root level with no parent folder. Move them into an appropriate folder.',
            icon: FileQuestion,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: folderHealth.orphanedFiles, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalFiles - folderHealth.orphanedFiles },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(folderHealth.orphanedFiles)}`}>{folderHealth.orphanedFiles}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalFiles}</span>,
        },
        {
            label: 'Stale Files',
            tooltip: 'Files not modified in the last 6 months. Candidates for archival or deletion.',
            icon: Clock,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: storageHealth.staleCount, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalFiles - storageHealth.staleCount },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(storageHealth.staleCount)}`}>{storageHealth.staleCount}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalFiles}</span>,
        },
        {
            label: 'Large Files',
            tooltip: 'Files larger than 50 MB. Consider splitting or archiving to keep the workspace efficient.',
            icon: HardDrive,
            segments: [
                { legendLabel: 'Issue', hex: RING.amber, value: storageHealth.largeCount, isIssue: true },
                { legendLabel: 'OK', hex: RING.green, value: totalFiles - storageHealth.largeCount },
            ],
            centerTop: <span className={`text-xl font-bold leading-none tabular-nums ${ragText(storageHealth.largeCount)}`}>{storageHealth.largeCount}</span>,
            centerBottom: <span className="text-[10px] text-gray-400 mt-0.5">/ {totalFiles}</span>,
        },
    ]

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* 3×3 grid: score ring first, then 8 KPI rings */}
            <div className="grid grid-cols-3 gap-8">
                {/* Score ring — cell 1 */}
                <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <FolderOpen className="h-4 w-4 text-gray-400" />
                        Overall Score
                        <InfoTip ariaLabel="About Folder Health Score" text="File organization quality (0–100). Penalizes badly named files, duplicates, stale files, large files, deeply nested folders, empty folders, and orphaned files." />
                    </p>
                    <Donut
                        total={100}
                        size={108}
                        thickness={13}
                        segments={[{ value: score, hex: scoreHex }]}
                        centerTop={<span className={`text-2xl font-bold leading-none tabular-nums ${scoreTextClass}`}>{score}</span>}
                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>}
                    />
                    <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: scoreHex }} />
                            <span className="text-gray-600 truncate">{label}</span>
                        </div>
                        {totalDeducted > 0 && (
                            <p className="text-xs text-gray-400 tabular-nums">100 − <span className="text-red-500 font-medium">{totalDeducted}</span> = <span className={`font-semibold ${scoreTextClass}`}>{score}</span></p>
                        )}
                    </div>
                </div>
                {/* 8 KPI rings */}
                {rings.map((r) => (
                    <FolderHealthRing
                        key={r.label}
                        label={r.label}
                        tooltip={r.tooltip}
                        icon={r.icon}
                        segments={r.segments}
                        centerTop={r.centerTop}
                        centerBottom={r.centerBottom}
                    />
                ))}
            </div>

            {/* Factors list */}
            {penalties.length > 0 ? (
                <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Factors</p>
                    {penalties.map((p) => {
                        const sev = severityLabel(p.points)
                        return (
                            <div key={p.label} className="flex items-center gap-1.5 text-[11px]">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${p.points >= 15 ? 'bg-red-400' : p.points >= 8 ? 'bg-amber-400' : 'bg-slate-300'}`} />
                                <span className="text-gray-600 truncate flex-1">{p.label}</span>
                                <span className={`text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ${sev.cls}`}>{sev.text}</span>
                                <span className={`tabular-nums shrink-0 ${deductClass(p.points)}`}>−{p.points}</span>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="pt-4 border-t border-gray-100 text-[11px] text-green-600 font-medium text-center">All clear — no issues found</p>
            )}
        </div>
    )
}

// Engagement Health card body: 3 rings (Health Score gauge · Delivery Status · Delivery Schedule)
// plus the health-score risk breakdown. Health Score excludes file-organization issues.
function EngagementHealthBody({ health, deliverables, planningHygiene, commentThreads, pace, firstTimeRight, inFlightWithRework, engagementCreatedAt, kickoffDate, engagementDueDate }: { health?: EngagementHealthScore; deliverables: DeliverableProgress[]; planningHygiene?: PlanningHygiene; commentThreads?: CommentThreads; pace?: EngagementPace; firstTimeRight?: FirstTimeRight; inFlightWithRework?: number; engagementCreatedAt?: string | null; kickoffDate?: string | null; engagementDueDate?: string | null }) {
    const total = deliverables.length

    // Ring 1 — Health Score gauge
    const healthHex = !health ? RING.gray : health.level === 'good' ? RING.green : health.level === 'warning' ? RING.amber : RING.red
    const healthTextClass = !health ? 'text-gray-400' : health.level === 'good' ? 'text-green-600' : health.level === 'warning' ? 'text-amber-600' : 'text-red-600'
    const healthLabel = !health ? '—' : health.level === 'good' ? 'Healthy' : health.level === 'warning' ? 'Needs attention' : 'Critical'
    const penalties = [...(health?.penalties ?? [])].sort((a, b) => b.points - a.points)
    const totalDeducted = penalties.reduce((s, p) => s + p.points, 0)

    // Ring 2 — Delivery Status (stage distribution)
    const statusItems = DELIVERABLE_STAGES.map((stage) => ({ label: DELIVERABLE_STAGE_META[stage].label, hex: DELIVERABLE_STAGE_META[stage].hex, value: deliverables.filter((d) => d.stage === stage).length }))
    const approved = deliverables.filter((d) => d.stage === 'approved').length
    const approvedPct = total > 0 ? Math.round((approved / total) * 100) : 0

    // Ring 3 — Delivery Schedule (due-date adherence)
    const overdue = deliverables.filter((d) => d.isOverdue).length
    const onTrack = deliverables.filter((d) => d.stage !== 'approved' && d.dueDate && !d.isOverdue).length
    const noDue = deliverables.filter((d) => d.stage !== 'approved' && !d.dueDate).length
    const scheduleItems = [
        { label: 'Completed', hex: RING.green, value: approved },
        { label: 'On Track', hex: RING.blue, value: onTrack },
        { label: 'Overdue', hex: RING.red, value: overdue },
        { label: 'No Due Date', hex: RING.gray, value: noDue },
    ]
    const onSchedulePct = total > 0 ? Math.round(((total - overdue) / total) * 100) : 0

    // Rings 4-6 — Overall Health Score inputs (internal only)
    const ph = planningHygiene
    const phDelivTotal = ph?.deliverableTotal ?? 0
    const phDocTotal = ph?.docTotal ?? 0
    const delivDueCov = phDelivTotal > 0 ? Math.round(((ph!.deliverableWithDueDate) / phDelivTotal) * 100) : 0
    const docDueCov = phDocTotal > 0 ? Math.round(((ph!.docWithDueDate) / phDocTotal) * 100) : 0
    const docAssigneeCov = phDocTotal > 0 ? Math.round(((ph!.docWithAssignee) / phDocTotal) * 100) : 0
    const hygieneCovs = [phDelivTotal > 0 ? delivDueCov : null, phDocTotal > 0 ? docDueCov : null, phDocTotal > 0 ? docAssigneeCov : null].filter((v): v is number => v !== null)
    const hygieneOverallPct = hygieneCovs.length > 0 ? Math.round(hygieneCovs.reduce((a, b) => a + b, 0) / hygieneCovs.length) : 0
    const hygieneNoWork = phDelivTotal === 0 && phDocTotal === 0
    const respPct = commentThreads && commentThreads.total > 0 ? Math.round((commentThreads.answered / commentThreads.total) * 100) : 100
    const paceScore = pace && pace.hasDeadline ? (pace.timePct > 0 ? Math.min(100, Math.round((pace.deliveredPct / pace.timePct) * 100)) : 100) : 0
    const paceHex = !pace || !pace.hasDeadline ? RING.gray : paceScore >= 90 ? RING.green : paceScore >= 60 ? RING.amber : RING.red
    const paceGap = pace ? pace.timePct - pace.deliveredPct : 0
    const paceStatus = !pace || !pace.hasDeadline ? 'No deadline set' : paceGap <= 0 ? 'On or ahead of pace' : paceGap <= 15 ? 'Slightly behind' : 'Behind pace'

    // Projected completion: based on actual approval rate since kickoff
    const nowMs = Date.now()
    const paceStartMs = kickoffDate ? new Date(kickoffDate).getTime()
        : engagementCreatedAt ? new Date(engagementCreatedAt).getTime()
        : null
    const remaining = total - approved
    const elapsedDays = paceStartMs && nowMs > paceStartMs ? (nowMs - paceStartMs) / DAY_MS : 0
    const dailyRate = elapsedDays >= 7 && approved > 0 ? approved / elapsedDays : 0
    const projectedCompletionMs = dailyRate > 0 && remaining > 0 ? nowMs + (remaining / dailyRate) * DAY_MS : null
    const formatProjectedDate = (ms: number) => {
        const d = new Date(ms)
        const now = new Date()
        const month = d.toLocaleString('en-US', { month: 'short' })
        const day = d.getDate()
        return `${month} ${day}${d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : ''}`
    }

    const ftrTotal = firstTimeRight?.totalApproved ?? 0
    const ftrPct = ftrTotal > 0 ? Math.round(((firstTimeRight!.firstTime) / ftrTotal) * 100) : 0

    const severityLabel = (pts: number) => pts >= 15 ? { text: 'HIGH', cls: 'bg-red-50 text-red-600 border-red-100' } : pts >= 8 ? { text: 'MED', cls: 'bg-amber-50 text-amber-600 border-amber-100' } : { text: 'LOW', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    const deductClass = (pts: number) => pts >= 15 ? 'text-red-600 font-bold' : pts >= 8 ? 'text-amber-600 font-semibold' : 'text-slate-400 font-medium'

    return (
        <div className="p-6 flex flex-col gap-6">
            <div className={`grid grid-cols-1 ${health ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-8`}>
                {/* Ring 1 — Health Score (internal only; stripped from external responses) */}
                {health && (
                    <div id="ring-health" className="flex flex-col items-center gap-3 scroll-mt-24">
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                            <Heart className="h-4 w-4 text-gray-400" /> Overall Health Score
                            <InfoTip ariaLabel="About Overall Health Score" text="Composite score (0–100) starting at 100 and reduced by weighted factors: overdue engagement, planning gaps, pace behind schedule, unanswered comments, sensitive files, and reworked deliverables. 80+ healthy · 50–79 needs attention · <50 critical." />
                        </p>
                        <Donut
                            total={100}
                            size={108}
                            thickness={13}
                            segments={[{ value: health.score, hex: healthHex }]}
                            centerTop={<span className={`text-2xl font-bold leading-none ${healthTextClass}`}>{health.score}</span>}
                            centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>}
                        />
                        <div className="text-center">
                            <p className={`text-xs font-medium ${healthTextClass}`}>{healthLabel}</p>
                            {totalDeducted > 0 && (
                                <p className="text-[11px] text-gray-400 mt-0.5">100 − <span className="text-red-500 font-medium">{totalDeducted}</span> = <span className={`font-semibold ${healthTextClass}`}>{health.score}</span></p>
                            )}
                        </div>
                        {/* Factors — directly under the Health Score ring */}
                        {penalties.length > 0 ? (
                            <div className="w-full max-w-[260px] pt-3 border-t border-gray-100 flex flex-col gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Factors</p>
                                {penalties.map((p) => {
                                    const sev = severityLabel(p.points)
                                    return (
                                        <div key={p.label} className="flex items-center gap-1.5 text-[11px]">
                                            <span className={`h-2 w-2 rounded-full shrink-0 ${p.points >= 15 ? 'bg-red-400' : p.points >= 8 ? 'bg-amber-400' : 'bg-slate-300'}`} />
                                            <span className="text-gray-600 truncate flex-1">{p.label}</span>
                                            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ${sev.cls}`}>{sev.text}</span>
                                            <span className={`tabular-nums shrink-0 ${deductClass(p.points)}`}>−{p.points}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="w-full max-w-[260px] pt-3 border-t border-gray-100 text-[11px] text-green-600 font-medium text-center">All clear — no risks</p>
                        )}
                    </div>
                )}
                {/* Ring 2 — Delivery Status */}
                <div id="ring-status" className="flex flex-col items-center gap-3 scroll-mt-24">
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-gray-400" /> Delivery Status
                        <InfoTip ariaLabel="About Delivery Status" text="Distribution of deliverables across workflow stages (To Do → In Progress → In Review → Approved). Center shows % of deliverables that have reached Approved." />
                    </p>
                    <RingWithLegend
                        items={statusItems}
                        centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{approvedPct}%</span>}
                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">approved</span>}
                    />
                </div>
                {/* Ring 3 — Delivery Schedule */}
                <div id="ring-schedule" className="flex flex-col items-center gap-3 scroll-mt-24">
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <CalendarClock className="h-4 w-4 text-gray-400" /> Delivery Schedule
                        <InfoTip ariaLabel="About Delivery Schedule" text="Due-date adherence across deliverables. Completed = approved. On Track = has a due date and not late. Overdue = due date has passed and not yet approved. No Due Date = no target set. Center shows % on schedule." />
                    </p>
                    <RingWithLegend
                        items={scheduleItems}
                        centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{onSchedulePct}%</span>}
                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on schedule</span>}
                    />
                </div>
                {/* Rings 4-6 — Overall Health Score inputs (internal only) */}
                {health && (
                    <>
                        <div id="ring-planning" className="flex flex-col items-center gap-3 scroll-mt-24">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                <ClipboardCheck className="h-4 w-4 text-gray-400" /> Planning Hygiene
                                <InfoTip ariaLabel="About Planning Hygiene" text="Setup coverage for in-flight (non-approved) work: deliverable due dates, subtask due dates, and subtask assignees. Concentric rings show each dimension's coverage. Center shows the average % set up." />
                            </p>
                            {hygieneNoWork ? (
                                <div className="flex flex-col items-center justify-center py-10 text-center">
                                    <p className="text-sm text-gray-500">No in-flight deliverables</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Nothing to plan right now.</p>
                                </div>
                            ) : (
                                <>
                                    <ConcentricRings
                                        rings={[
                                            { pct: delivDueCov, hex: RING.green },
                                            { pct: docDueCov, hex: RING.blue },
                                            { pct: docAssigneeCov, hex: RING.indigo },
                                        ]}
                                        centerTop={<span className="text-lg font-bold text-gray-900 tabular-nums leading-none">{hygieneOverallPct}%</span>}
                                        centerBottom={<span className="text-[9px] text-gray-400">set up</span>}
                                    />
                                    <div className="flex flex-col gap-1.5 w-full max-w-[240px]">
                                        <PlanningGapRow hex={RING.green} label="Deliverable due dates" missing={phDelivTotal - (ph?.deliverableWithDueDate ?? 0)} total={phDelivTotal} />
                                        <PlanningGapRow hex={RING.blue} label="Doc due dates" missing={phDocTotal - (ph?.docWithDueDate ?? 0)} total={phDocTotal} />
                                        <PlanningGapRow hex={RING.indigo} label="Doc assignees" missing={phDocTotal - (ph?.docWithAssignee ?? 0)} total={phDocTotal} />
                                    </div>
                                </>
                            )}
                        </div>
                        <div id="ring-comments" className="flex flex-col items-center gap-3 scroll-mt-24">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                <MessagesSquare className="h-4 w-4 text-gray-400" /> Comment Responsiveness
                                <InfoTip ariaLabel="About Comment Responsiveness" text="Share of document comment threads that have been answered by the firm (last message not from an external contributor). Higher is better." />
                            </p>
                            <RingWithLegend
                                items={[
                                    { label: 'Answered', hex: RING.green, value: commentThreads?.answered ?? 0 },
                                    { label: 'Unanswered', hex: RING.red, value: commentThreads?.unanswered ?? 0 },
                                ]}
                                centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{respPct}%</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">answered</span>}
                            />
                        </div>
                        <div id="ring-pace" className="flex flex-col items-center gap-3 scroll-mt-24">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                <Gauge className="h-4 w-4 text-gray-400" /> Pace
                                <InfoTip ariaLabel="About Pace" text="Delivery progress vs. time elapsed — % delivered ÷ % of engagement duration used. 100% = on pace. Below 100% = behind. Requires a kickoff date and due date." />
                            </p>
                            <Donut
                                total={100}
                                size={108}
                                thickness={14}
                                segments={[{ value: paceScore, hex: paceHex }]}
                                centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{pace?.hasDeadline ? `${paceScore}%` : '—'}</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on pace</span>}
                            />
                            <div className="text-center">
                                <p className="text-xs font-medium text-gray-600">{paceStatus}</p>
                                {pace?.hasDeadline && (
                                    <p className="text-[11px] text-gray-400 mt-0.5">{pace.deliveredPct}% delivered · {pace.timePct}% elapsed</p>
                                )}
                                {projectedCompletionMs !== null && (
                                    <p className="text-[11px] text-[#5A78FF] font-medium mt-1.5 bg-[#5A78FF]/6 border border-[#5A78FF]/20 rounded px-2 py-0.5">
                                        At this pace, completion ~{formatProjectedDate(projectedCompletionMs)}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Ring 7 — First-Time-Right (approved deliverables only) */}
                        <div id="ring-ftr" className="flex flex-col items-center gap-3 scroll-mt-24">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                <Target className="h-4 w-4 text-gray-400" /> First-Time-Right
                                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">approved only</span>
                                <InfoTip ariaLabel="About First-Time-Right" text="Of the deliverables that reached Approved, the share that got there without ever being sent back for rework (zero backward status transitions). In-flight deliverables don't count until they're approved. Higher is better." />
                            </p>
                            {ftrTotal > 0 ? (
                                <RingWithLegend
                                    items={[
                                        { label: 'Approved first pass', hex: RING.green, value: firstTimeRight?.firstTime ?? 0 },
                                        { label: 'Approved after rework', hex: RING.amber, value: firstTimeRight?.reworked ?? 0 },
                                    ]}
                                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{ftrPct}%</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{firstTimeRight!.firstTime}/{ftrTotal} approved</span>}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Target className="h-8 w-8 text-gray-200 mb-2" />
                                    <p className="text-xs text-gray-500">No approved deliverables yet</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Ring updates once a deliverable is approved.</p>
                                </div>
                            )}
                            {(inFlightWithRework ?? 0) > 0 && (
                                <p className="text-[11px] text-amber-600 font-medium bg-amber-50 border border-amber-100 rounded px-2 py-1 max-w-[240px] text-center">
                                    <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />
                                    {inFlightWithRework} in-flight deliverable{inFlightWithRework === 1 ? '' : 's'} already reworked — this % may drop.
                                </p>
                            )}
                        </div>
                    </>
                )}
                {/* Visual 8 — Delivery Timeline (spans full width across all 3 columns) */}
                <DeliveryTimeline
                    deliverables={deliverables}
                    engagementCreatedAt={engagementCreatedAt ?? null}
                    kickoffDate={kickoffDate ?? null}
                    engagementDueDate={engagementDueDate ?? null}
                />
            </div>
        </div>
    )
}

export interface EngagementInsightsDashboardProps {
    projectId: string
    orgSlug?: string
    clientSlug?: string
    engagementSlug?: string
    /** External roles (EC/EV): render only the deliverables analytics section. */
    isExternalPersona?: boolean
}

export function EngagementInsightsDashboard({
    projectId,
    orgSlug = '',
    clientSlug = '',
    engagementSlug = '',
    isExternalPersona = false,
}: EngagementInsightsDashboardProps) {
    const { session } = useAuth()
    const [data, setData] = useState<EngagementInsightsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTick, setRefreshTick] = useState(0)
    const [shareState, setShareState] = useState<'idle' | 'capturing' | 'confirm' | 'sending' | 'sent' | 'error'>('idle')
    const [shareError, setShareError] = useState<string | null>(null)
    const [dlState, setDlState] = useState<'idle' | 'capturing' | 'done'>('idle')
    const healthCardRef = useRef<HTMLDivElement>(null)

    const engagementBase = orgSlug && clientSlug && engagementSlug
        ? `/d/f/${orgSlug}/c/${clientSlug}/e/${engagementSlug}`
        : ''

    // Shared capture helper — returns jsPDF instance with the health card rendered
    const captureHealthCard = async () => {
        const el = healthCardRef.current
        if (!el) throw new Error('Card not mounted')

        const [html2canvasMod, jsPDFMod] = await Promise.all([import('html2canvas'), import('jspdf')])
        const html2canvas = html2canvasMod.default ?? (html2canvasMod as any)
        const JsPDF = (jsPDFMod as any).jsPDF ?? jsPDFMod.default

        const captureW = el.offsetWidth
        // Measure from the already-rendered live element — its layout has fully settled.
        // The clone's grid/flex layout may not settle within a single rAF, so prefer
        // the live scrollHeight and use the clone only to escape overflow ancestors.
        const liveScrollH = el.scrollHeight

        // Deep-clone into a top-level absolute container at document (0,0) so that
        // no flex/overflow ancestor can clip the canvas region. Remove any height
        // constraints on the clone so it expands to its full natural height.
        const clone = el.cloneNode(true) as HTMLElement
        clone.style.cssText += ';height:auto!important;max-height:none!important;overflow:visible!important;'

        // --- PDF text-rendering fixes ---
        // html2canvas does not render `text-overflow: ellipsis`, so truncated spans
        // just hard-clip mid-word. Remove the constraint and let labels wrap instead.
        clone.querySelectorAll('.truncate').forEach((node) => {
            const span = node as HTMLElement
            span.classList.remove('truncate')
            span.style.overflow = 'visible'
            span.style.whiteSpace = 'normal'
            span.style.textOverflow = 'unset'
        })
        // Lift the 260 px max-width on the health-score factors container so the
        // now-wrapping labels have the full column width available.
        const factorsContainer = clone.querySelector('#ring-health > :last-child') as HTMLElement | null
        if (factorsContainer) factorsContainer.style.maxWidth = 'none'
        // --------------------------------

        const offscreen = document.createElement('div')
        // Give the offscreen wrapper a guaranteed large height so the clone is never
        // vertically constrained, and overflow:visible so nothing is clipped.
        offscreen.style.cssText = `position:absolute;top:0;left:0;width:${captureW}px;min-height:${liveScrollH}px;height:auto;overflow:visible;background:#ffffff;z-index:99999;pointer-events:none;`
        offscreen.appendChild(clone)
        document.body.appendChild(offscreen)

        // Two rAFs + 100 ms: first rAF commits the element to the render tree,
        // second rAF lets the browser complete its layout pass, timeout flushes
        // any deferred style calculations (e.g. grid auto-rows, SVG viewBox).
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100))))

        // Use whichever height is larger: the settled clone (which now has wrapped
        // text, so may be taller than the live element) or the live scroll height.
        const captureH = Math.max(clone.scrollHeight, liveScrollH)

        // html2canvas sign convention: canvas-Y = getBoundingClientRect().top - (-scrollY_option)
        // Clone is at absolute top:0 → getBoundingClientRect().top = -window.scrollY.
        // To anchor canvas-Y = 0: -window.scrollY + window.scrollY = 0 ✓
        const canvas = await html2canvas(clone, {
            scale: 1.5,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: -window.scrollX,
            scrollY: -window.scrollY,
            width: captureW,
            height: captureH,
            windowWidth: captureW,
            windowHeight: captureH,
        })

        document.body.removeChild(offscreen)

        const imgData = canvas.toDataURL('image/jpeg', 0.85)
        const pdf = new JsPDF({ orientation: captureW > captureH ? 'landscape' : 'portrait', unit: 'px', format: [captureW, captureH] })
        pdf.addImage(imgData, 'JPEG', 0, 0, captureW, captureH)
        return pdf
    }

    const pdfFilename = (engagementSlug ?? 'engagement').replace(/[^a-zA-Z0-9_-]/g, '_') + '_Health_Report.pdf'

    const handleDownloadHealth = async () => {
        if (dlState !== 'idle') return
        setDlState('capturing')
        try {
            const pdf = await captureHealthCard()
            pdf.save(pdfFilename)
            setDlState('done')
            setTimeout(() => setDlState('idle'), 2500)
        } catch {
            setDlState('idle')
        }
    }

    const handleShareHealth = async () => {
        if (!session?.access_token) return
        setShareState('capturing')
        setShareError(null)
        try {
            const pdf = await captureHealthCard()

            const buf = pdf.output('arraybuffer') as ArrayBuffer
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
            const pdfBase64 = btoa(binary)
            if (!pdfBase64) throw new Error('PDF generation produced empty output')

            setShareState('sending')
            const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
            const res = await fetch(`/api/projects/${projectId}/insights/share-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ pdfBase64, pageUrl }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json?.error ?? `Server error ${res.status}`)
            setShareState('sent')
            setTimeout(() => setShareState('idle'), 3000)
        } catch (e) {
            setShareError(e instanceof Error ? e.message : 'Something went wrong')
            setShareState('error')
        }
    }

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

    // External roles (EC/EV): only the deliverables analytics — no internal cards.
    if (isExternalPersona) {
        return (
            <TooltipProvider delayDuration={150}>
            <div className="pb-6">
                <div className="bg-white border border-[#e5e7eb] rounded flex flex-col shadow-md overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-gray-900">Deliverables</h2>
                            {dueLabel && (
                                <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${dueBadgeColor}`}>Due: {dueLabel}</span>
                            )}
                        </div>
                        <button onClick={() => setRefreshTick((t) => t + 1)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors" title="Refresh">
                            <RefreshCw className={`h-4 w-4 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    {loading ? (
                        <div className="h-48 m-6 rounded-2xl bg-gray-100 animate-pulse" />
                    ) : (
                        <EngagementHealthBody deliverables={data?.deliverables ?? []} engagementCreatedAt={data?.engagementCreatedAt ?? null} kickoffDate={data?.kickoffDate ?? null} engagementDueDate={data?.engagementDueDate ?? null} />
                    )}
                </div>
            </div>
            </TooltipProvider>
        )
    }

    return (
        <TooltipProvider delayDuration={150}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', paddingBottom: '1.5rem', alignItems: 'stretch' }}>
            {/* Left: outer card — all informational content */}
            <div className="bg-white border border-[#e5e7eb] rounded p-6 flex flex-col gap-6 shadow-md">
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

                {/* Engagement Health — Health Score · Delivery Status · Delivery Schedule (Phase 7 & 8) */}
                {!loading && data && (() => {
                    const inFlightIds = new Set((data.deliverables ?? []).filter((d) => d.stage !== 'approved').map((d) => d.id))
                    const inFlightWithRework = (data.revisionMetrics ?? []).filter((r) => inFlightIds.has(r.documentId) && r.revisions > 0).length
                    const memberCount = data.memberCount ?? 0
                    return (
                        <InsightCard
                            title="Engagement Health"
                            icon={Heart}
                            theme={data.healthScore?.level === 'critical' ? 'red' : data.healthScore?.level === 'warning' ? 'amber' : 'green'}
                            subtext={`Overall Health ${data.healthScore?.score ?? '—'}/100 · ${data.deliverables?.length ?? 0} deliverable${(data.deliverables?.length ?? 0) === 1 ? '' : 's'}`}
                            headerExtra={
                                <div className="flex items-center gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="greenCta"
                                                size="sm"
                                                onClick={handleDownloadHealth}
                                                disabled={dlState !== 'idle'}
                                                className={`gap-2 text-[10px] font-headline font-bold tracking-widest uppercase${dlState !== 'idle' ? ' cursor-wait' : ''}`}
                                            >
                                                {dlState === 'capturing' ? (
                                                    <><RefreshCw className="h-3 w-3 animate-spin" /> Capturing…</>
                                                ) : dlState === 'done' ? (
                                                    <><Check className="h-3 w-3" /> Downloaded</>
                                                ) : (
                                                    <><Download className="h-3 w-3" /> Download</>
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            Download engagement health report as PDF
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="greenCta"
                                                size="sm"
                                                onClick={handleShareHealth}
                                                disabled={shareState !== 'idle' && shareState !== 'error'}
                                                className={`gap-2 text-[10px] font-headline font-bold tracking-widest uppercase${shareState !== 'idle' && shareState !== 'error' ? ' cursor-wait' : ''}`}
                                            >
                                                {shareState === 'capturing' ? (
                                                    <><RefreshCw className="h-3 w-3 animate-spin" /> Capturing…</>
                                                ) : shareState === 'sending' ? (
                                                    <><RefreshCw className="h-3 w-3 animate-spin" /> Sending…</>
                                                ) : shareState === 'sent' ? (
                                                    <><Check className="h-3 w-3" /> Sent</>
                                                ) : shareState === 'error' ? (
                                                    <><X className="h-3 w-3" /> Error</>
                                                ) : (
                                                    <><Mail className="h-3 w-3" /> Share</>
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            {shareState === 'error'
                                                ? (shareError ?? 'Something went wrong — try again')
                                                : `Email health report PDF to ${memberCount} team member${memberCount === 1 ? '' : 's'}`}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            }
                        >
                            <div ref={healthCardRef}>
                                {/* Quick-stats row — inside the card so they export with the PDF */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 pb-0">
                                    <TileWithTip text="Members invited to the engagement who haven't yet accepted. Includes internal (EL/EM) and external (EC/EV) invites." ariaLabel="About Pending Invites">
                                        <StatTile
                                            icon={Users}
                                            label="Pending Invites"
                                            count={data.pendingInvitations.length}
                                            colorClass="bg-[#5A78FF]/5 text-[#5A78FF]"
                                        />
                                    </TileWithTip>
                                    <TileWithTip text="% of the engagement's planned duration that has elapsed, from kickoff (or engagement creation) to due date. Amber ≥60%, red ≥85%." ariaLabel="About Time Lapsed">
                                        {(() => {
                                            if (!data.engagementDueDate) return <StatTile icon={Timer} label="Time Lapsed" count="—" colorClass="bg-gray-50 text-gray-400" />
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
                                            return <StatTile icon={Timer} label="Time Lapsed" count={`${pct}%`} sub={`${dueStr} · ${sourceLabel}`} colorClass={colorClass} />
                                        })()}
                                    </TileWithTip>
                                    <TileWithTip text="Average number of backward stage transitions (rework loops) per deliverable, e.g. In Review → In Progress. Counted from DOCUMENT_STATUS_CHANGED audit events. Lower is better." ariaLabel="About Avg Revision Rounds">
                                        {(() => {
                                            const rm = data.revisionMetrics
                                            const avg = rm?.length ? rm.reduce((s, r) => s + r.revisions, 0) / rm.length : null
                                            return (
                                                <StatTile
                                                    icon={RefreshCw}
                                                    label="Avg Revision Rounds"
                                                    count={avg === null ? '—' : avg.toFixed(1)}
                                                    sub={rm?.length ? 'per deliverable' : undefined}
                                                    colorClass="bg-violet-50 text-violet-600"
                                                />
                                            )
                                        })()}
                                    </TileWithTip>
                                    <TileWithTip text="Average time from marking a folder as a Deliverable (share.createdAt) to it being Approved (share.finalizedAt). Only counts approved deliverables. Green ≤7d, amber ≤14d, red >14d." ariaLabel="About Avg Time to Approval">
                                        {(() => {
                                            const cyc = data.approvalCycle?.avgCycleDays
                                            const colorClass = cyc == null ? 'bg-gray-50 text-gray-400' : cyc <= 7 ? 'bg-green-50 text-green-600' : cyc <= 14 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                                            return (
                                                <StatTile
                                                    icon={Clock}
                                                    label="Avg Time to Approval"
                                                    count={cyc == null ? '—' : `${cyc}d`}
                                                    sub={data.approvalCycle && data.approvalCycle.approvedCount > 0 ? `To Do → Approved · ${data.approvalCycle.approvedCount} deliverable${data.approvalCycle.approvedCount > 1 ? 's' : ''}` : 'none approved yet'}
                                                    colorClass={colorClass}
                                                />
                                            )
                                        })()}
                                    </TileWithTip>
                                </div>
                                <EngagementHealthBody health={data.healthScore} deliverables={data.deliverables ?? []} planningHygiene={data.planningHygiene} commentThreads={data.commentThreads} pace={data.pace} firstTimeRight={data.firstTimeRight} inFlightWithRework={inFlightWithRework} engagementCreatedAt={data.engagementCreatedAt} kickoffDate={data.kickoffDate} engagementDueDate={data.engagementDueDate} />
                            </div>
                        </InsightCard>
                    )
                })()}

                {loading ? (
                    <div className="grid grid-cols-2 gap-6">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {/* Team Status */}
                        <InsightCard
                            title="Team Status"
                            count={data?.memberCount ?? 0}
                            icon={Users}
                            theme="blue"
                            subtext="Members & pending invitations"
                            headerExtra={
                                engagementBase ? (
                                    <Link href={`${engagementBase}/members`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                        Manage
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                ) : undefined
                            }
                        >
                            {data && <TeamStatusBody data={data} />}
                        </InsightCard>

                        {/* File Organization */}
                        {data && (
                            <InsightCard
                                title="File Organization"
                                icon={FolderOpen}
                                theme="blue"
                                subtext={`${data.storageHealth.totalFiles} file${data.storageHealth.totalFiles === 1 ? '' : 's'} · ${data.folderHealth.totalFolders} folder${data.folderHealth.totalFolders === 1 ? '' : 's'} · max depth ${data.folderHealth.maxDepth} · ${formatBytes(data.storageHealth.totalSizeBytes)}`}
                            >
                                <FolderHealthBody storageHealth={data.storageHealth} folderHealth={data.folderHealth} />
                            </InsightCard>
                        )}

                        {/* Document Activity */}
                        {data && (
                            <DocActivitySection data={data} engagementBase={engagementBase} />
                        )}
                    </div>
                )}
            </div>

            {/* Right: Action Center */}
            <EngagementActionCenterV2 data={data} loading={loading} engagementBase={engagementBase} projectId={projectId} setRefreshTick={setRefreshTick} />
        </div>
        </TooltipProvider>
    )
}
