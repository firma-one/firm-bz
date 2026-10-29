'use client'

import { BarChart3, ClipboardList, Folder, LayoutGrid, MessagesSquare, PenTool, Settings, Users } from 'lucide-react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tag } from '@/components/ui/tag'
import { AccessLock } from '@/components/ui/access-lock'
import { GoogleDriveIcon } from '@/components/ui/google-drive-icon'
import { OneDriveIcon } from '@/components/ui/onedrive-icon'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'
import type { TourNodeId } from '@/lib/demo/tour-chapters'

/** Thin indeterminate bar under a tab while its route loads. */
export function PendingBar() {
    return (
        <span className="absolute -bottom-px left-0 right-0 h-0.5 overflow-hidden">
            <span className="absolute inset-y-0 w-1/2 animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full bg-fg" />
        </span>
    )
}

/** Which tabs the viewer gets and their counts — all decided server-side by the engagement page. */
export type EngagementTabsConfig = {
    clientConnectorType?: string | null
    sharesCount?: number
    commentsCount?: number
    wikiPageCount?: number
    auditCount?: number
    memberCount?: number
    enableBetaFeatures?: boolean
    canViewInternalTabs: boolean
    canManage: boolean
    canViewSettings: boolean
}

const count = (n: number | undefined) =>
    n !== undefined && n > 0 ? <span className="text-small tabular-nums text-fg-subtle">{n}</span> : null

/**
 * The engagement's underline tab row: each tab reads {label} {count} {lock}. Shared by the page and its loading state, so a tab switch
 * keeps the exact same row on screen while the next tab loads. Must sit inside a `<Tabs>`.
 */
export function EngagementTabsList({ pendingTab, ...c }: EngagementTabsConfig & { pendingTab?: string | null }) {
    const pending = (tab: string) => (pendingTab === tab ? <PendingBar /> : null)
    return (
        <TabsList className="min-w-max border-b-0">
            <TabsTrigger value="analytics" data-demo-tour="engagement-overview-tab" className="relative gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Overview
                {pending('analytics')}
            </TabsTrigger>
            <TabsTrigger value="files" data-demo-tour="engagement-files-tab" className="relative gap-1.5">
                {c.clientConnectorType === 'ONEDRIVE' ? (
                    <OneDriveIcon size={15} />
                ) : c.clientConnectorType === 'GOOGLE_DRIVE' ? (
                    <GoogleDriveIcon size={15} />
                ) : (
                    <Folder className="h-4 w-4" />
                )}
                Files
                {pending('files')}
            </TabsTrigger>
            <TabsTrigger value="board" data-demo-tour="engagement-board-tab" className="relative gap-1.5">
                <LayoutGrid className="h-4 w-4" />
                Board
                {count(c.sharesCount)}
                {pending('board')}
            </TabsTrigger>
            <TabsTrigger value="comments" data-demo-tour="engagement-comments-tab" className="relative gap-1.5">
                <MessagesSquare className="h-4 w-4" />
                Discussions
                {count(c.commentsCount)}
                {pending('comments')}
            </TabsTrigger>
            {c.enableBetaFeatures && c.canViewInternalTabs && (
                <TabsTrigger value="wiki" className="relative gap-1.5">
                    <PenTool className="h-4 w-4" />
                    Dossier
                    <Tag color="yellow" className="h-4 px-1 text-[10px]">Beta</Tag>
                    <AccessLock label="Internal only — external contributors and reviewers don't see this" />
                    {count(c.wikiPageCount)}
                    {pending('wiki')}
                </TabsTrigger>
            )}
            {c.canManage && (
                <TabsTrigger value="audit" data-demo-tour="engagement-audit-tab" className="relative gap-1.5">
                    <ClipboardList className="h-4 w-4" />
                    Audit
                    {count(c.auditCount)}
                    <AccessLock label="Engagement leads and firm admins only" />
                    {pending('audit')}
                </TabsTrigger>
            )}
            {c.canViewInternalTabs && (
                <TabsTrigger value="members" data-demo-tour="engagement-members-tab" className="relative gap-1.5">
                    <Users className="h-4 w-4" />
                    Members
                    {count(c.memberCount)}
                    <AccessLock label="Internal only — external contributors and reviewers don't see this" />
                    {pending('members')}
                </TabsTrigger>
            )}
            {c.canViewSettings && (
                <TabsTrigger value="settings" data-demo-tour="engagement-settings-tab" className="relative gap-1.5">
                    <Settings className="h-4 w-4" />
                    Settings
                    <AccessLock label="Engagement leads and firm admins only" />
                    {pending('settings')}
                </TabsTrigger>
            )}
        </TabsList>
    )
}

/** What the engagement page last showed above its tab body, kept so the loading state can redraw it. */
export type EngagementChromeSnapshot = {
    projectId: string
    clientName?: string
    name: string
    description?: string
    status: LwCrmEngagementStatus
    kickoffDate: string | null
    dueDate: string | null
    showPeople: boolean
    personaDisplayName?: string | null
    /** Whether the header links the guided tour: not for client roles (engagementTabGuide). */
    tourLinks: boolean
    tabs: EngagementTabsConfig
}

/** The guided tour's section for an engagement tab, linked beside the page title
 * (.claude/plans/tour-chapters.md). Settings has none: the tour only says where it is. */
const TAB_GUIDES: Record<string, TourNodeId> = {
    analytics: 'engagement-overview',
    files: 'files',
    board: 'board',
    comments: 'discussions',
    members: 'engagement-members',
    audit: 'engagement-audit',
}

export function engagementTabGuide(tab: string): TourNodeId | null {
    return TAB_GUIDES[tab] ?? null
}

/**
 * In-memory only (this tab, this session): the snapshot is what this viewer's own page already
 * rendered — tabs included, as their permissions resolved — so redrawing it during a reload of the
 * same engagement shows nothing they couldn't already see. A hard reload starts empty.
 */
const chromeCache = new Map<string, EngagementChromeSnapshot>()

export const engagementChromeKey = (firmSlug: string, clientSlug: string, engagementSlug: string) =>
    `${firmSlug}/${clientSlug}/${engagementSlug}`

export function rememberEngagementChrome(key: string, snapshot: EngagementChromeSnapshot) {
    chromeCache.set(key, snapshot)
}

export function readEngagementChrome(key: string): EngagementChromeSnapshot | undefined {
    return chromeCache.get(key)
}
