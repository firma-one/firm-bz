'use client'

import { useEffect, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { Tabs } from "@/components/ui/tabs"
import { EngagementInsightsDashboard } from './engagement-insights-dashboard'
import type { EngagementRoleSlug } from '@/lib/deliverable-stage-roles'
import { EngagementFileList } from './engagement-file-list'
import { type BreadcrumbItem } from '@/lib/files-folder-session'
import { EngagementSettingsForm } from './engagement-settings-form'
import { LayoutGrid, List } from 'lucide-react'
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
import { EngagementHeader } from './engagement-header'
import { EngagementTabsList, engagementChromeKey, engagementTabGuide, rememberEngagementChrome, type EngagementTabsConfig } from './engagement-tabs'
import { HorizontalScroll } from '@/components/ui/horizontal-scroll'

export interface ProjectPathSegments {
    tab: string
    viewMode: 'list' | 'board' | 'grid'
    wikiPageSlug?: string | null
}

interface EngagementWorkspaceProps {
    groupSlug: string
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
    /** Client-level connector type (GOOGLE_DRIVE/ONEDRIVE) — used to switch the "New file" menu between Google Workspace and Office file types. */
    clientConnectorType?: string | null
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

const projectBase = (groupSlug: string, orgSlug: string, clientSlug: string, projectSlug: string, useEngagement = false) =>
    useEngagement ? `/d/${groupSlug}/f/${orgSlug}/c/${clientSlug}/e/${projectSlug}` : `/d/${groupSlug}/f/${orgSlug}/c/${clientSlug}/p/${projectSlug}`

export function EngagementWorkspace({
    groupSlug,
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
    clientConnectorType,
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
    const [pendingTab, setPendingTab] = useState<string | null>(null)

    const slugFromPath = pathname?.split('/e/')[1]?.split('/')[0] ?? pathname?.split('/p/')[1]?.split('/')[0] ?? ''
    const projectSlug = engagementSlug ?? slugFromPath
    const useEngagement = Boolean(engagementSlug)
    const base = projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)
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

    // What sits above the tab body. The route's loading state redraws it from this snapshot, so a tab
    // switch keeps the header and tab row on screen and only the body shows a skeleton.
    const tabsConfig: EngagementTabsConfig = {
        clientConnectorType,
        sharesCount,
        commentsCount,
        wikiPageCount,
        auditCount,
        memberCount,
        enableBetaFeatures,
        canViewInternalTabs: Boolean(canViewInternalTabs),
        canManage: Boolean(canManage),
        canViewSettings: Boolean(canViewSettings),
    }
    useEffect(() => {
        if (!projectSlug) return
        rememberEngagementChrome(engagementChromeKey(orgSlug, clientSlug, projectSlug), {
            projectId,
            clientName,
            name: projectName ?? '',
            description: projectDescription,
            status: engagementStatus,
            kickoffDate: engagementKickoffDate,
            dueDate: engagementDueDate,
            showPeople: Boolean(canViewInternalTabs),
            personaDisplayName: projectPersonaDisplayName,
            tourLinks: !isExternalPersona,
            tabs: tabsConfig,
        })
    })

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

            <EngagementHeader
                projectId={projectId}
                groupSlug={groupSlug}
                orgSlug={orgSlug}
                clientSlug={clientSlug}
                clientName={clientName}
                name={projectName ?? ''}
                description={projectDescription}
                status={engagementStatus}
                kickoffDate={engagementKickoffDate}
                dueDate={engagementDueDate}
                canManage={canManage}
                showPeople={canViewInternalTabs}
                membersHref={`${base}/members`}
                personaDisplayName={projectPersonaDisplayName}
                // The tour shows the firm's view, so client roles (and "view as" one) get no link.
                guide={isExternalPersona ? null : engagementTabGuide(currentTab)}
            />

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                {/* Underline tabs (Linear/Notion); page actions sit at the right end of the tab row. */}
                <div className="mb-4 flex shrink-0 items-end justify-between gap-3 border-b border-line">
                    <HorizontalScroll>
                        <EngagementTabsList {...tabsConfig} pendingTab={pendingTab} />
                    </HorizontalScroll>
                    {/* New Document button slot — EngagementFileList portals into this when Files is active */}
                    {currentTab === 'files' && (
                        <div ref={setFilesNavSlot} className="flex shrink-0 items-center pb-1" />
                    )}
                    {/* Grid / List toggle — only when Shares tab is active */}
                    {currentTab === 'shares' && (() => {
                        const sharesBase = `${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/shares`
                        const sharesViewMode = pathSegments?.viewMode ?? 'grid'
                        return (
                            <div className="flex shrink-0 items-center pb-1">
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        title="Grid view"
                                        onClick={() => router.push(`${sharesBase}/grid`)}
                                        className={`rounded-control p-1.5 transition-colors ${sharesViewMode === 'grid' ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'}`}
                                    >
                                        <LayoutGrid className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        title="List view"
                                        onClick={() => router.push(`${sharesBase}/list`)}
                                        className={`rounded-control p-1.5 transition-colors ${sharesViewMode === 'list' ? 'bg-surface-selected text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'}`}
                                    >
                                        <List className="h-3.5 w-3.5" />
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
                                        clientConnectorType={clientConnectorType}
                                        workspaceRootLocation={workspaceRootLocation}
                                        rootFolderName={projectName}
                                        orgName={orgName}
                                        clientName={clientName}
                                        projectName={projectName}
                                        canEdit={canEdit}
                                        canManage={canManage}
                                        isFirmAdmin={isFirmAdmin}
                                        restrictToSharedOnly={restrictToSharedOnly}
                                        roleSlug={roleSlug as EngagementRoleSlug | undefined}
                                        firmId={firmId}
                                        groupSlug={groupSlug}
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
                                    sharesBasePath={`${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode={pathSegments?.viewMode}
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
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
                                    sharesBasePath={`${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/shares`}
                                    pathViewMode="board"
                                    deeplinkBase={typeof window !== 'undefined' ? `${window.location.origin}${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/files` : undefined}
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
                                groupSlug={groupSlug}
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
                                onCancel={() => router.push(`${base}/files`)}
                                onSaved={() => {
                                    router.push(`${base}/files`)
                                    router.refresh()
                                }}
                            />
                        )}
                    </div>
                ) : (currentTab === 'analytics') ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ErrorBoundary context="ProjectInsights">
                            <EngagementInsightsDashboard
                                projectId={projectId}
                                groupSlug={groupSlug}
                                orgSlug={orgSlug}
                                clientSlug={clientSlug}
                                engagementSlug={engagementSlug}
                                isFirmAdmin={isFirmAdmin}
                                firmName={orgName}
                                clientName={clientName}
                                engagementName={projectName}
                            />
                        </ErrorBoundary>
                    </div>
                ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {currentTab === 'comments' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectComments">
                                <EngagementCommentsTab
                                    projectId={projectId}
                                    orgSlug={orgSlug}
                                    boardUrl={`${projectBase(groupSlug, orgSlug, clientSlug, projectSlug, useEngagement)}/board`}
                                />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canViewInternalTabs && currentTab === 'members' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectMembers">
                                <EngagementMembersTab projectId={projectId} groupSlug={groupSlug} orgSlug={orgSlug} canManage={canManage} clientConnectorId={clientConnectorId} />
                            </ErrorBoundary>
                        </div>
                    )}
                    {canManage && currentTab === 'audit' && (
                        <div className="py-1 h-full">
                            <ErrorBoundary context="ProjectAudit">
                                <EngagementAuditPane projectId={projectId} projectName={projectName} />
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
