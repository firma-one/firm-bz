'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectInsightsDashboard } from './project-insights-dashboard'
import { ProjectFileList } from './project-file-list'
import { setSavedFolderState, type BreadcrumbItem } from '@/lib/files-folder-session'
import { ProjectSettingsForm } from './project-settings-form'
import { Folder, BarChart3, Building2, PenTool, ChevronRight, ChevronLeft, Users, Briefcase, Share2, Settings, Home, ClipboardList, MessageCircle, Lock, LayoutGrid, List } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ProjectMembersTab } from './members/project-members-tab'
import { ProjectSharesTab } from './shares/project-shares-tab'
import { ErrorBoundary } from '@/components/error-boundary'
import { ProjectSearchProvider } from './project-search-context'
import { useViewAs } from '@/lib/view-as-context'
import { ProjectAuditPane } from './project-audit-pane'
import { ProjectCommentsTab } from './project-comments-tab'
import { ProjectWikiTab } from './wiki/project-wiki-tab'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'

export interface ProjectPathSegments {
    tab: string
    viewMode: 'list' | 'board' | 'grid'
    wikiPageSlug?: string | null
}

interface ProjectWorkspaceProps {
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
    /** When true (eng_ext_collaborator/eng_viewer), only show shared docs in file list */
    restrictToSharedOnly?: boolean
    /** When true (eng_viewer only), shows Accept Document option in document action menu */
    isExternalViewer?: boolean
    projectDescription?: string
    engagementKickoffDate?: string | null
    engagementDueDate?: string | null
    engagementStatus?: LwCrmEngagementStatus
    engagementContractType?: string
    engagementRateOrValue?: string | null
    engagementTags?: string[]
    /** When provided, tab and shares sub-state are driven by URL (path-based navigation) */
    pathSegments?: ProjectPathSegments
    /** Current user's project persona display name (from JWT / project settings plus); shown as badge on the title tile */
    projectPersonaDisplayName?: string | null
    /** When set, use /e/ (engagement) routes instead of /p/ (project). */
    engagementSlug?: string
    firmSandboxOnly?: boolean
    enableBetaFeatures?: boolean
    fileCount?: number
    sharesCount?: number
    commentsCount?: number
    memberCount?: number
    auditCount?: number
    wikiPageCount?: number
}

const projectBase = (orgSlug: string, clientSlug: string, projectSlug: string, useEngagement = false) =>
    useEngagement ? `/d/f/${orgSlug}/c/${clientSlug}/e/${projectSlug}` : `/d/f/${orgSlug}/c/${clientSlug}/p/${projectSlug}`

export function ProjectWorkspace({
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
    restrictToSharedOnly = false,
    isExternalViewer = false,
    projectDescription,
    engagementKickoffDate = null,
    engagementDueDate = null,
    engagementStatus = 'ACTIVE',
    engagementContractType = '',
    engagementRateOrValue = null,
    engagementTags = [],
    pathSegments,
    projectPersonaDisplayName,
    engagementSlug,
    firmSandboxOnly = false,
    enableBetaFeatures = false,
    fileCount,
    sharesCount,
    commentsCount,
    memberCount,
    auditCount,
    wikiPageCount,
}: ProjectWorkspaceProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { viewAsPersonaSlug } = useViewAs()
    const [filesNavSlot, setFilesNavSlot] = useState<HTMLDivElement | null>(null)
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

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

    const handleTabChange = useCallback((value: string) => {
        if (value === 'board') { router.push(`${base}/board`); return }
        const suffix = value === 'shares' ? '/grid' : ''
        router.push(`${base}/${value}${suffix}`)
    }, [base, router])

    const handleOpenInFiles = useCallback((folderId: string, breadcrumbs: BreadcrumbItem[], hash?: string) => {
        setSavedFolderState(projectId, folderId, breadcrumbs)
        router.push(`${base}/files${hash ? '#' + hash : ''}`)
    }, [projectId, base, router])

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-[#45474c] opacity-60" />
                <Link
                    href={`/d/f/${orgSlug}`}
                    className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter hover:opacity-100 transition-opacity"
                >
                    {orgName || 'Organization'}
                </Link>
                {clientName && (
                    <>
                        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                        <Users className="h-4 w-4 text-[#45474c] opacity-60" />
                        <Link
                            href={`/d/f/${orgSlug}/c/${clientSlug}`}
                            className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter hover:opacity-100 transition-opacity"
                        >
                            {clientName}
                        </Link>
                    </>
                )}
                {projectName && (
                    <>
                        <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                        <Briefcase className="h-4 w-4 text-[#069668]" />
                        <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
                            {projectName}
                        </span>
                    </>
                )}
            </nav>

            {/* Project Identity Header — sits directly on pearl bg, no card wrapper */}
            <div className="flex items-start justify-between gap-6 mb-6">
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
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-[#45474c]">Manage files, sharing and collaboration for this engagement.</p>
                            {engagementDueDate && (() => {
                                const today = new Date(); today.setHours(0, 0, 0, 0)
                                const due = new Date(engagementDueDate); due.setHours(0, 0, 0, 0)
                                const days = Math.round((due.getTime() - today.getTime()) / 86400000)
                                const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`
                                const color = days < 0 ? 'bg-red-50 text-red-700 border-red-200' : days <= 7 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-[#f0edee] text-[#45474c] border-[#e5e7eb]'
                                return <span className={`shrink-0 rounded font-mono text-[10px] border px-2 py-0.5 ${color}`}>{label}</span>
                            })()}
                            {projectPersonaDisplayName && (
                                <span
                                    className="shrink-0 bg-[#ecfdf5] text-[#065f46] border border-[#069668]/20 rounded font-mono text-[10px] px-2 py-0.5"
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
                <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 flex items-center h-14">
                    <div className="flex-1 min-w-0 relative h-full">
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => tabsScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
                            className="absolute left-0 top-0 z-10 h-full w-14 flex items-center justify-center bg-gradient-to-r from-white from-70% to-transparent text-[#45474c] hover:text-[#1b1b1d] transition-colors"
                            aria-label="Scroll tabs left"
                        >
                            <span className="w-5 h-5 rounded-full border border-[#069668] bg-white flex items-center justify-center shadow-sm">
                                <ChevronLeft className="w-3 h-3 text-[#069668]" />
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
                            <span className="w-5 h-5 rounded-full border border-[#069668] bg-white flex items-center justify-center shadow-sm">
                                <ChevronRight className="w-3 h-3 text-[#069668]" />
                            </span>
                        </button>
                    )}
                    <div ref={tabsScrollRef} className="overflow-x-auto h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollPaddingLeft: canScrollLeft ? 40 : 0, scrollPaddingRight: canScrollRight ? 40 : 0 }}>
                    <div className="flex items-center h-full min-w-max" style={{ paddingLeft: canScrollLeft ? 56 : 0, paddingRight: canScrollRight ? 56 : 0 }}>
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            {canViewInternalTabs && (
                                <TabsTrigger
                                    value="analytics"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <BarChart3 className="w-4 h-4 mr-2" />
                                    Analytics
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                </TabsTrigger>
                            )}
                            <TabsTrigger
                                value="files"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <Folder className="w-4 h-4 mr-2" />
                                Files
                                {fileCount !== undefined && fileCount > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {fileCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                value="shares"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <Share2 className="w-4 h-4 mr-2" />
                                Shares
                                {sharesCount !== undefined && sharesCount > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {sharesCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            {enableBetaFeatures && canViewInternalTabs && (
                                <TabsTrigger
                                    value="board"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <LayoutGrid className="w-4 h-4 mr-2" />
                                    Board
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    <span className="ml-2 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 leading-none">Beta</span>
                                </TabsTrigger>
                            )}
                            <TabsTrigger
                                value="comments"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <MessageCircle className="w-4 h-4 mr-2" />
                                Comments
                                {commentsCount !== undefined && commentsCount > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {commentsCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            {enableBetaFeatures && canViewInternalTabs && (
                                <TabsTrigger
                                    value="wiki"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <PenTool className="w-4 h-4 mr-2" />
                                    Dossier
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    <span className="ml-2 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 leading-none">Beta</span>
                                    {wikiPageCount !== undefined && wikiPageCount > 0 && (
                                        <span className="ml-1 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {wikiPageCount}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {canManage && (
                                <TabsTrigger
                                    value="audit"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <ClipboardList className="w-4 h-4 mr-2" />
                                    Audit
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {auditCount !== undefined && auditCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {auditCount}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {canViewInternalTabs && (
                                <TabsTrigger
                                    value="members"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <Users className="w-4 h-4 mr-2" />
                                    Members
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                    {memberCount !== undefined && memberCount > 0 && (
                                        <span className="ml-2 font-mono text-[10px] font-bold bg-[#069668] text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                            {memberCount}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {canViewSettings && (
                                <TabsTrigger
                                    value="settings"
                                    className="group/lock h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-[#069668] data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Settings
                                    <span title="Internal only"><Lock className="w-2.5 h-2.5 ml-1 text-[#45474c]/40 group-hover/lock:text-[#45474c] transition-colors shrink-0" /></span>
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </div>
                    </div>
                    </div>
                    {/* New Document button slot — ProjectFileList portals into this when Files is active */}
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
                                        className={`px-1.5 py-1 rounded transition-all ${sharesViewMode === 'grid' ? 'bg-white shadow-sm text-[#069668]' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
                                    >
                                        <LayoutGrid className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        title="List view"
                                        onClick={() => router.push(`${sharesBase}/list`)}
                                        className={`px-1.5 py-1 rounded transition-all ${sharesViewMode === 'list' ? 'bg-white shadow-sm text-[#069668]' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f0edee]'}`}
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
                            <ErrorBoundary context="ProjectFileList">
                                <ProjectSearchProvider projectId={projectId} viewAsPersonaSlug={viewAsPersonaSlug}>
                                    <ProjectFileList
                                        projectId={projectId}
                                        connectorRootFolderId={connectorRootFolderId}
                                        rootFolderName={projectName}
                                        orgName={orgName}
                                        clientName={clientName}
                                        projectName={projectName}
                                        canEdit={canEdit}
                                        canManage={canManage}
                                        restrictToSharedOnly={restrictToSharedOnly}
                                        firmId={firmId}
                                        firmSandboxOnly={firmSandboxOnly}
                                        navSlot={filesNavSlot}
                                    />
                                </ProjectSearchProvider>
                            </ErrorBoundary>
                        )}
                        {currentTab === 'shares' && (
                            <ErrorBoundary context="ProjectShares">
                                <ProjectSharesTab
                                    projectId={projectId}
                                    canManage={canManage}
                                    restrictToSharedOnly={restrictToSharedOnly}
                                    isExternalViewer={isExternalViewer}
                                    connectorRootFolderId={connectorRootFolderId ?? undefined}
                                    orgName={orgName}
                                    clientName={clientName}
                                    projectName={projectName}
                                    onOpenInFiles={handleOpenInFiles}
                                    sharesBasePath={`${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode={pathSegments?.viewMode}
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
                                />
                            </ErrorBoundary>
                        )}
                        {currentTab === 'board' && (
                            <ErrorBoundary context="ProjectBoard">
                                <ProjectSharesTab
                                    projectId={projectId}
                                    canManage={canManage}
                                    restrictToSharedOnly={restrictToSharedOnly}
                                    isExternalViewer={isExternalViewer}
                                    connectorRootFolderId={connectorRootFolderId ?? undefined}
                                    orgName={orgName}
                                    clientName={clientName}
                                    projectName={projectName}
                                    onOpenInFiles={handleOpenInFiles}
                                    sharesBasePath={`${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode="board"
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
                                />
                            </ErrorBoundary>
                        )}
                    </div>
                ) : (currentTab === 'settings') ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
                        {canViewSettings && (
                            <ProjectSettingsForm
                                projectId={projectId}
                                orgSlug={orgSlug}
                                clientSlug={clientSlug}
                                initialName={projectName ?? ''}
                                initialDescription={projectDescription}
                                initialKickoffDate={engagementKickoffDate}
                                initialDueDate={engagementDueDate}
                                initialStatus={engagementStatus}
                                initialContractType={engagementContractType}
                                initialRateOrValue={engagementRateOrValue}
                                initialTags={engagementTags}
                                firmSandboxOnly={firmSandboxOnly}
                                onCancel={() => router.push(`${base}/files`)}
                                onSaved={() => {
                                    router.push(`${base}/files`)
                                    router.refresh()
                                }}
                            />
                        )}
                    </div>
                ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white border border-[#e5e7eb] rounded">
                    {currentTab === 'comments' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectComments">
                                <ProjectCommentsTab projectId={projectId} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canViewInternalTabs && currentTab === 'members' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectMembers">
                                <ProjectMembersTab projectId={projectId} orgSlug={orgSlug} canManage={canManage} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canViewInternalTabs && currentTab === 'analytics' && (
                        <div className="p-4">
                            <ErrorBoundary context="ProjectInsights">
                                <ProjectInsightsDashboard
                                    projectId={projectId}
                                    orgSlug={orgSlug}
                                    clientSlug={clientSlug}
                                    engagementSlug={engagementSlug}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canManage && currentTab === 'audit' && (
                        <div className="p-4 h-full">
                            <ErrorBoundary context="ProjectAudit">
                                <ProjectAuditPane projectId={projectId} projectName={projectName} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {currentTab === 'wiki' && canViewInternalTabs && (
                        <div className="h-full">
                            <ErrorBoundary context="ProjectDossier">
                                <ProjectWikiTab
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
