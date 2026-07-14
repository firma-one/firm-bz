'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EngagementInsightsDashboard } from './engagement-insights-dashboard'
import { EngagementFileList } from './engagement-file-list'
import { type BreadcrumbItem } from '@/lib/files-folder-session'
import { EngagementSettingsForm } from './engagement-settings-form'
import { Folder, BarChart3, Building2, PenTool, ChevronRight, ChevronLeft, Users, Briefcase, Share2, Settings, Home, ClipboardList, MessagesSquare, Lock, LayoutGrid, List } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { EngagementMembersTab } from './members/engagement-members-tab'
import { EngagementSharesTab } from './shares/engagement-shares-tab'
import { ErrorBoundary } from '@/components/error-boundary'
import { EngagementSearchProvider } from './engagement-search-context'
import { useViewAs } from '@/lib/view-as-context'
import { EngagementAuditPane } from './engagement-audit-pane'
import { EngagementCommentsTab } from './engagement-comments-tab'
import { EngagementWikiTab } from './wiki/engagement-wiki-tab'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import { AddReminderPopover } from './add-reminder-popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export interface ProjectPathSegments {
    tab: string
    viewMode: 'list' | 'board' | 'grid'
    wikiPageSlug?: string | null
}

interface EngagementWorkspaceProps {
    orgSlug: string
    clientSlug: string
    projectId: string
    connectorRootFolderId?: string | null
    orgName?: string
    clientName?: string
    projectName?: string
    /** Organization id (for secure-open modal thumbnail in Files tab). */
    firmId?: string
    canViewSettings?: boolean
    /** Members, Shares, Insights tabs: true for Team Member, Project Lead, Client/Org Owners; false for Guest, External Collaborator */
    canViewInternalTabs?: boolean
    canEdit?: boolean
    canManage?: boolean
    isFirmAdmin?: boolean
    /** When true (eng_ext_collaborator/eng_viewer), only show shared docs in file list */
    restrictToSharedOnly?: boolean
    /** When true (eng_viewer only), shows Accept Document option in document action menu */
    isExternalViewer?: boolean
    /** The user's engagement role slug — used to derive allowed lane transitions */
    roleSlug?: string
    projectDescription?: string
    engagementKickoffDate?: string | null
    engagementDueDate?: string | null
    engagementFollowUpDate?: string | null
    engagementStatus?: LwCrmEngagementStatus
    clientStatus?: string | null
    engagementContractType?: string
    engagementRateOrValue?: string | null
    engagementTags?: string[]
    engagementInternalMemo?: string | null
    /** When provided, tab and shares sub-state are driven by URL (path-based navigation) */
    pathSegments?: ProjectPathSegments
    /** Current user's project persona display name (from JWT / project settings plus); shown as badge on the title tile */
    projectPersonaDisplayName?: string | null
    /** When set, use /e/ (engagement) routes instead of /p/ (project). */
    engagementSlug?: string
    firmSandboxOnly?: boolean
    enableBetaFeatures?: boolean
    /** Client-level connector ID — used to offer "Set up Drive folder" when connector exists but engagement folder not yet provisioned. */
    clientConnectorId?: string | null
    /** Workspace root location — passed to EngagementFileList for Shared Drive empty state. */
    workspaceRootLocation?: string | null
    /** Connector account email — passed to EngagementFileList for Google Drive authuser param. */
    connectorAccountEmail?: string | null
    fileCount?: number
    sharesCount?: number
    commentsCount?: number
    memberCount?: number
    auditCount?: number
    wikiPageCount?: number
}

const projectBase = (orgSlug: string, clientSlug: string, projectSlug: string, useEngagement = false) =>
    useEngagement ? `/d/f/${orgSlug}/c/${clientSlug}/e/${projectSlug}` : `/d/f/${orgSlug}/c/${clientSlug}/p/${projectSlug}`

export function EngagementWorkspace({
    orgSlug,
    clientSlug,
    projectId,
    connectorRootFolderId,
    orgName,
    clientName,
    projectName,
    firmId,
    canViewSettings = false,
    canViewInternalTabs = false,
    canEdit = false,
    canManage = false,
    isFirmAdmin = false,
    restrictToSharedOnly = false,
    isExternalViewer = false,
    roleSlug,
    projectDescription,
    engagementKickoffDate = null,
    engagementDueDate = null,
    engagementFollowUpDate = null,
    engagementStatus = 'ACTIVE',
    clientStatus,
    engagementContractType = '',
    engagementRateOrValue = null,
    engagementTags = [],
    engagementInternalMemo = null,
    pathSegments,
    projectPersonaDisplayName,
    engagementSlug,
    firmSandboxOnly = false,
    enableBetaFeatures = false,
    clientConnectorId,
    workspaceRootLocation,
    connectorAccountEmail,
    fileCount,
    sharesCount,
    commentsCount,
    memberCount,
    auditCount,
    wikiPageCount,
}: EngagementWorkspaceProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { viewAsPersonaSlug } = useViewAs()
    // External roles (EC/EV) — including internal users previewing via "view as".
    // Drives the Overview tab: externals get only the deliverables analytics section.
    const isExternalPersona = restrictToSharedOnly || viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer'
    const [liveFileCount, setLiveFileCount] = useState<number | undefined>(fileCount)
    useEffect(() => { setLiveFileCount(fileCount) }, [fileCount])
    const [filesNavSlot, setFilesNavSlot] = useState<HTMLDivElement | null>(null)
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)
    const [pendingTab, setPendingTab] = useState<string | null>(null)

    const updateScrollState = useCallback(() => {
        const el = tabsScrollRef.current
        if (!el) return
        setCanScrollLeft(el.scrollLeft > 0)
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }, [])

    useEffect(() => {
        const el = tabsScrollRef.current
        if (!el) return
        updateScrollState()
        el.addEventListener('scroll', updateScrollState)
        const ro = new ResizeObserver(updateScrollState)
        ro.observe(el)
        return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
    }, [updateScrollState])
    const slugFromPath = pathname?.split('/e/')[1]?.split('/')[0] ?? pathname?.split('/p/')[1]?.split('/')[0] ?? ''
    const projectSlug = engagementSlug ?? slugFromPath
    const useEngagement = Boolean(engagementSlug)
    const base = projectBase(orgSlug, clientSlug, projectSlug, useEngagement)
    const currentTab = pathSegments?.tab ?? 'files'

    // Broadcast real names so the sidebar Recents hook can replace slug-derived labels
    useEffect(() => {
        if (!projectSlug) return
        window.dispatchEvent(new CustomEvent('firma-page-context', {
            detail: { type: 'engagement', name: projectName, slug: projectSlug, clientName, clientSlug },
        }))
    }, [projectSlug, projectName, clientName, clientSlug])

    // Deeplinks for docs/comments should always land in Files tab so the file list can
    // resolve and highlight the target item.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const ensureFilesTabForDeeplink = () => {
            const hash = window.location.hash.replace(/^#/, '')
            if (!hash) return
            if (!(hash.startsWith('doc-file:') || hash.startsWith('doc-comment:'))) return
            if (currentTab === 'files') return
            router.push(`${base}/files#${hash}`)
        }
        ensureFilesTabForDeeplink()
        window.addEventListener('hashchange', ensureFilesTabForDeeplink)
        return () => window.removeEventListener('hashchange', ensureFilesTabForDeeplink)
    }, [base, currentTab, router])

    // Clear pending state once pathname catches up (engagement tabs navigate by path, not query param)
    useEffect(() => {
        setPendingTab(null)
    }, [pathname])

    const handleTabChange = useCallback((value: string) => {
        setPendingTab(value)
        if (value === 'board') { router.push(`${base}/board`); return }
        const suffix = value === 'shares' ? '/grid' : ''
        router.push(`${base}/${value}${suffix}`)
    }, [base, router])

    const handleOpenInFiles = useCallback((folderId: string, breadcrumbs: BreadcrumbItem[], hash?: string) => {
        router.push(`${base}/files${hash ? '#' + hash : ''}`)
    }, [base, router])

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            href={`/d/f/${orgSlug}`}
                            className="flex items-center gap-1.5 hover:opacity-100"
                        >
                            <Building2 className="h-4 w-4 text-[#45474c] opacity-60" />
                            <span className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter transition-opacity">
                                {orgName || 'Organization'}
                            </span>
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent>Firm</TooltipContent>
                </Tooltip>
                {clientName && (
                    <>
                        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link
                                    href={`/d/f/${orgSlug}/c/${clientSlug}`}
                                    className="flex items-center gap-1.5 hover:opacity-100"
                                >
                                    <Users className="h-4 w-4 text-[#45474c] opacity-60" />
                                    <span className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter transition-opacity">
                                        {clientName}
                                    </span>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent>Client</TooltipContent>
                        </Tooltip>
                    </>
                )}
                {projectName && (
                    <>
                        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-1.5">
                                    <Briefcase className="h-4 w-4 text-primary" />
                                    <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
                                        {projectName}
                                    </span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>Engagement</TooltipContent>
                        </Tooltip>
                    </>
                )}
            </nav>

            {/* Project Identity Header — sits directly on pearl bg, no card wrapper */}
            <div className="flex items-start justify-between gap-6 mb-6" data-demo-tour="engagement-header">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                        <Briefcase className="h-10 w-10 text-[#1b1b1d]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d] truncate">
                                {projectName || 'Engagement Workspace'}
                            </h1>
                            {engagementStatus && (
                                <span className="bg-[#f0edee] text-[#45474c] border border-[#e5e7eb] px-2 py-0.5 rounded font-mono text-[10px] tracking-tight uppercase shrink-0">
                                    {engagementStatus}
                                </span>
                            )}
                            {clientStatus === 'PROSPECT' && (
                                <span className="bg-fuchsia-50 text-fuchsia-500 border border-fuchsia-200 px-2 py-0.5 rounded font-mono text-[10px] tracking-tight uppercase shrink-0">
                                    Prospect
                                </span>
                            )}
                            {engagementDueDate && (() => {
                                const today = new Date(); today.setHours(0, 0, 0, 0)
                                const due = new Date(engagementDueDate); due.setHours(0, 0, 0, 0)
                                const days = Math.round((due.getTime() - today.getTime()) / 86400000)
                                const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`
                                const color = days < 0 ? 'bg-red-50 text-red-700 border-red-200' : days <= 7 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-[#f0edee] text-[#45474c] border-[#e5e7eb]'
                                return <span className={`shrink-0 rounded font-mono text-[10px] border px-2 py-0.5 ${color}`}>{label}</span>
                            })()}
                            {firmId && projectId && (
                                <AddReminderPopover
                                    entityKey="platform.engagements"
                                    entityValue={projectId}
                                    entityName={projectName ?? 'Engagement'}
                                    firmId={firmId}
                                    ctaUrl={`/d/f/${orgSlug}/c/${clientSlug}/e/${engagementSlug ?? ''}`}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-[#45474c]">Manage files, sharing and collaboration for this engagement.</p>
                            {projectPersonaDisplayName && (
                                <span
                                    className="shrink-0 bg-primary/10 text-primary border border-primary/20 rounded font-mono text-[10px] px-2 py-0.5"
                                    title="Your role in this project"
                                >
                                    {projectPersonaDisplayName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                {/* Tab strip — full-width white with border-b, scrollable for many tabs */}
                <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 flex items-center h-14 overflow-hidden">
                    <div className="flex-1 min-w-0 relative h-full">
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
                            className="absolute left-0 top-0 z-10 h-full w-14 flex items-center justify-center bg-gradient-to-r from-white from-70% to-transparent text-[#45474c] hover:text-[#1b1b1d] transition-colors"
                            aria-label="Scroll tabs left"
                        >
                            <span className="w-5 h-5 rounded-full border border-primary bg-white flex items-center justify-center shadow-sm">
                                <ChevronLeft className="w-3 h-3 text-primary" />
                            </span>
                        </button>
                    )}
                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                            className="absolute right-0 top-0 z-10 h-full w-14 flex items-center justify-center bg-gradient-to-l from-white from-70% to-transparent text-[#45474c] hover:text-[#1b1b1d] transition-colors"
                            aria-label="Scroll tabs right"
                        >
                            <span className="w-5 h-5 rounded-full border border-primary bg-white flex items-center justify-center shadow-sm">
                                <ChevronRight className="w-3 h-3 text-primary" />
                            </span>
                        </button>
                    )}
                    <div ref={tabsScrollRef} className="overflow-x-auto h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollPaddingLeft: canScrollLeft ? 40 : 0, scrollPaddingRight: canScrollRight ? 40 : 0 }}>
                    <div className="flex items-center h-full min-w-max" style={{ paddingLeft: canScrollLeft ? 56 : 0, paddingRight: canScrollRight ? 56 : 0 }}>
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            <TabsTrigger
                                value="analytics"
                                data-demo-tour="engagement-overview-tab"
                                className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Overview
                                                {pendingTab === 'analytics' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                            </TabsTrigger>
                            <TabsTrigger
                                value="files"
                                data-demo-tour="engagement-files-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <Folder className="w-4 h-4 mr-2" />
                                Files
                                {pendingTab === 'files' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                            </TabsTrigger>
                            <TabsTrigger
                                value="board"
                                data-demo-tour="engagement-board-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                Board
                                {sharesCount !== undefined && sharesCount > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {sharesCount}
                                    </span>
                                )}
                                {pendingTab === 'board' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                            </TabsTrigger>
                            <TabsTrigger
                                value="comments"
                                data-demo-tour="engagement-comments-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <MessagesSquare className="w-4 h-4 mr-2" />
                                Comments
                                {commentsCount !== undefined && commentsCount > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {commentsCount}
                                    </span>
                                )}
                                {pendingTab === 'comments' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                            </TabsTrigger>
                            {enableBetaFeatures && canViewInternalTabs && (
                                <TabsTrigger
                                    value="wiki"
                                    className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <PenTool className="w-4 h-4 mr-2" />
                                    Dossier
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    <span className="ml-2 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 leading-none">Beta</span>
                                    {wikiPageCount !== undefined && wikiPageCount > 0 && (
                                        <span className="ml-1 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {wikiPageCount}
                                        </span>
                                    )}
                                    {pendingTab === 'wiki' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                                </TabsTrigger>
                            )}
                            {canManage && (
                                <TabsTrigger
                                    value="audit"
                                    data-demo-tour="engagement-audit-tab"
                                    className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <ClipboardList className="w-4 h-4 mr-2" />
                                    Audit
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {auditCount !== undefined && auditCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {auditCount}
                                        </span>
                                    )}
                                    {pendingTab === 'audit' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                                </TabsTrigger>
                            )}
                            {canViewInternalTabs && (
                                <TabsTrigger
                                    value="members"
                                    data-demo-tour="engagement-members-tab"
                                    className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <Users className="w-4 h-4 mr-2" />
                                    Members
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {memberCount !== undefined && memberCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {memberCount}
                                        </span>
                                    )}
                                    {pendingTab === 'members' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                                </TabsTrigger>
                            )}
                            {canViewSettings && (
                                <TabsTrigger
                                    value="settings"
                                    data-demo-tour="engagement-settings-tab"
                                    className="relative group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Settings
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {pendingTab === 'settings' && <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"><span className="absolute inset-y-0 w-1/2 bg-brand-accent animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full" /></span>}
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </div>
                    </div>
                    </div>
                    {/* New Document button slot — EngagementFileList portals into this when Files is active */}
                    {currentTab === 'files' && (
                        <div ref={setFilesNavSlot} className="shrink-0 px-3 border-l border-[#e5e7eb] flex items-center" />
                    )}
                    {/* Grid / List toggle — only when Shares tab is active */}
                    {currentTab === 'shares' && (() => {
                        const sharesBase = `${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/shares`
                        const sharesViewMode = pathSegments?.viewMode ?? 'grid'
                        return (
                            <div className="shrink-0 px-3 border-l border-[#e5e7eb] flex items-center">
                                <div className="flex items-center bg-[#f3f4f6] p-0.5 rounded border border-[#e5e7eb]">
                                    <button
                                        type="button"
                                        title="Grid view"
                                        onClick={() => router.push(`${sharesBase}/grid`)}
                                        className={`px-1.5 py-1 rounded transition-all ${sharesViewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
                                    >
                                        <LayoutGrid className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        title="List view"
                                        onClick={() => router.push(`${sharesBase}/list`)}
                                        className={`px-1.5 py-1 rounded transition-all ${sharesViewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
                                    >
                                        <List className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        )
                    })()}
                </div>

                {/* Only mount the active tab's content so Files tree is not rendered when on Shares/others (performance). */}
                {/* Shares gets its own layout (toolbar on bg + content card); all other tabs share the card wrapper */}
                {/* Files and Shares render breadcrumb/toolbar on bg; content card is owned by the component */}
                {(currentTab === 'files' || currentTab === 'shares' || currentTab === 'board') ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {currentTab === 'files' && (
                            <ErrorBoundary context="EngagementFileList">
                                <EngagementSearchProvider projectId={projectId} viewAsPersonaSlug={viewAsPersonaSlug}>
                                    <EngagementFileList
                                        projectId={projectId}
                                        connectorRootFolderId={connectorRootFolderId}
                                        clientConnectorId={clientConnectorId}
                                        workspaceRootLocation={workspaceRootLocation}
                                        rootFolderName={projectName}
                                        orgName={orgName}
                                        clientName={clientName}
                                        projectName={projectName}
                                        canEdit={canEdit}
                                        canManage={canManage}
                                        isFirmAdmin={isFirmAdmin}
                                        restrictToSharedOnly={restrictToSharedOnly}
                                        firmId={firmId}
                                        orgSlug={orgSlug}
                                        firmSandboxOnly={firmSandboxOnly}
                                        navSlot={filesNavSlot}
                                        clientSlug={clientSlug}
                                        connectorAccountEmail={connectorAccountEmail}
                                        onFileCountChange={setLiveFileCount}
                                    />
                                </EngagementSearchProvider>
                            </ErrorBoundary>
                        )}
                        {currentTab === 'shares' && (
                            <ErrorBoundary context="ProjectShares">
                                <EngagementSharesTab
                                    projectId={projectId}
                                    canManage={canManage}
                                    restrictToSharedOnly={restrictToSharedOnly}
                                    isExternalViewer={isExternalViewer}
                                    roleSlug={roleSlug as any}
                                    connectorRootFolderId={connectorRootFolderId ?? undefined}
                                    orgName={orgName}
                                    clientName={clientName}
                                    projectName={projectName}
                                    onOpenInFiles={handleOpenInFiles}
                                    sharesBasePath={`${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode={pathSegments?.viewMode}
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
                                    orgSlug={orgSlug}
                                />
                            </ErrorBoundary>
                        )}
                        {currentTab === 'board' && (
                            <ErrorBoundary context="ProjectBoard">
                                <EngagementSharesTab
                                    projectId={projectId}
                                    canManage={canManage}
                                    restrictToSharedOnly={restrictToSharedOnly}
                                    isExternalViewer={isExternalViewer}
                                    roleSlug={roleSlug as any}
                                    connectorRootFolderId={connectorRootFolderId ?? undefined}
                                    orgName={orgName}
                                    clientName={clientName}
                                    projectName={projectName}
                                    onOpenInFiles={handleOpenInFiles}
                                    sharesBasePath={`${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode="board"
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
                                    orgSlug={orgSlug}
                                />
                            </ErrorBoundary>
                        )}
                    </div>
                ) : (currentTab === 'settings') ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
                        {canViewSettings && (
                            <EngagementSettingsForm
                                projectId={projectId}
                                orgSlug={orgSlug}
                                clientSlug={clientSlug}
                                initialName={projectName ?? ''}
                                initialDescription={projectDescription}
                                initialKickoffDate={engagementKickoffDate}
                                initialDueDate={engagementDueDate}
                                initialFollowUpDate={engagementFollowUpDate}
                                initialStatus={engagementStatus}
                                initialContractType={engagementContractType}
                                initialRateOrValue={engagementRateOrValue}
                                initialTags={engagementTags}
                                initialInternalMemo={engagementInternalMemo}
                                firmSandboxOnly={firmSandboxOnly}
                                onCancel={() => router.push(`${base}/files`)}
                                onSaved={() => {
                                    router.push(`${base}/files`)
                                    router.refresh()
                                }}
                            />
                        )}
                    </div>
                ) : (currentTab === 'analytics') ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-3">
                        <ErrorBoundary context="ProjectInsights">
                            <EngagementInsightsDashboard
                                projectId={projectId}
                                orgSlug={orgSlug}
                                clientSlug={clientSlug}
                                engagementSlug={engagementSlug}
                                isFirmAdmin={isFirmAdmin}
                                isSandboxFirm={firmSandboxOnly}
                                firmName={orgName}
                                clientName={clientName}
                                engagementName={projectName}
                            />
                        </ErrorBoundary>
                    </div>
                ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white border border-[#e5e7eb] rounded">
                    {currentTab === 'comments' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectComments">
                                <EngagementCommentsTab
                                    projectId={projectId}
                                    orgSlug={orgSlug}
                                    boardUrl={`${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/board`}
                                    isSandboxFirm={firmSandboxOnly}
                                    projectName={projectName}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canViewInternalTabs && currentTab === 'members' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectMembers">
                                <EngagementMembersTab projectId={projectId} orgSlug={orgSlug} canManage={canManage} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canManage && currentTab === 'audit' && (
                        <div className="p-4 h-full">
                            <ErrorBoundary context="ProjectAudit">
                                <EngagementAuditPane projectId={projectId} projectName={projectName} isSandboxFirm={firmSandboxOnly} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {currentTab === 'wiki' && canViewInternalTabs && (
                        <div className="h-full">
                            <ErrorBoundary context="ProjectDossier">
                                <EngagementWikiTab
                                    engagementId={projectId}
                                    firmId={firmId ?? ''}
                                    canEdit={canEdit}
                                    initialPageSlug={pathSegments?.wikiPageSlug ?? null}
                                    base={base}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                </div>
                )}
            </Tabs>
        </div>
    )
}
