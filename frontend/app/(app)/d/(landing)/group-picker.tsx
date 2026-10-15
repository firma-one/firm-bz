'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, LayoutGrid, Loader2, Plus, Home, ChevronRight } from 'lucide-react'
import { getUserGroups, getUserFirms, createOwnWorkspace, type UserGroupOption } from '@/lib/actions/firms'
import { BRAND_NAME } from '@/config/brand'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageHeading } from '@/components/ui/page-heading'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { Tag } from '@/components/ui/tag'
import { WorkspaceCard } from '@/components/projects/workspace-card'
import { WorkspaceTable } from '@/components/projects/workspace-table'
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle'
import { useUiShell } from '@/lib/ui-shell-context'
import { groupFirmListPath } from '@/lib/navigation/firm-paths'
import { useAuth } from '@/lib/auth-context'
import { switchFirm } from '@/lib/actions/firms'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'

/**
 * Group-level picker rendered by `(landing)/page.tsx` when `resolveDefaultFirmLandingPath`
 * resolves to `/d/` (2+ distinct groups) — same card-grid pattern as
 * `app/(app)/d/[groupSlug]/f/page.tsx` (`WorkspacePickerPage`), one level up: one card per
 * distinct Group instead of per Firm. See .claude/plans/sandbox-firm-removal.md, Step 6.
 *
 * This is a plain component, not its own `page.tsx` — `resolveDefaultFirmLandingPath` returning
 * the literal string `/d/` from a page ALREADY handling `/d` would be a self-redirect, so
 * `(landing)/page.tsx` renders this directly instead of calling `redirect('/d/')`.
 *
 * Reached two ways:
 * 1. Auto-routing: `resolveDefaultFirmLandingPath` resolves to `/d/` for users with 2+ groups.
 * 2. Deliberate navigation: the Profile menu's "Switch Workspace" link (shown for 2+ groups,
 *    or for a single-group non-admin user — see `shouldShowSwitchWorkspace`) links to `/d/`,
 *    which re-runs the same resolution and lands here the same way.
 *
 * Case 2 is why this component also handles the single-group non-admin scenario (ordinary
 * auto-routing never resolves to `/d/` for a single-group user) — it shows their one existing
 * group's card plus a "Create your own workspace" action, so an invited firm member with no
 * group of their own has a standing way to bootstrap one (a genuinely new Group + Firm +
 * Subscription, not a satellite firm added to their existing group — see `createOwnWorkspace`'s
 * doc comment). That single-group case only reaches this component via `(landing)/page.tsx`'s
 * own explicit handling of the "1 group, not admin" case (see there), not through
 * `resolveDefaultFirmLandingPath`'s `/d/` return, which never fires for exactly 1 group.
 */
export function GroupPicker() {
    const router = useRouter()
    const uiShell = useUiShell()
    const { user } = useAuth()
    const [groups, setGroups] = useState<UserGroupOption[]>([])
    const [firms, setFirms] = useState<Awaited<ReturnType<typeof getUserFirms>>>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetGroup, setTargetGroup] = useState<UserGroupOption | null>(null)
    const [isSwitching, setIsSwitching] = useState(false)
    const [switchError, setSwitchError] = useState<string | null>(null)
    // Opens as a table, like All clients; the gallery is one click away and remembered.
    const [viewMode, setViewMode] = useViewMode('fm-workspaces-view')

    useEffect(() => {
        async function load() {
            const [userGroups, userFirms] = await Promise.all([getUserGroups(), getUserFirms()])
            setGroups(userGroups)
            setFirms(userFirms)
            setLoading(false)
        }
        void load()
    }, [])

    // The active firm's group — determines which group card is "current" (no confirmation
    // needed to re-enter it) vs. a genuine switch (needs FirmSwitchDialog, same as the
    // firm-level picker at `/d/[groupSlug]/f`).
    const activeFirmSlug = (user?.app_metadata as { active_firm_slug?: string } | undefined)?.active_firm_slug ?? null
    const currentGroupId = activeFirmSlug ? firms.find((f) => f.slug === activeFirmSlug)?.groupId ?? null : null

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="md" />
            </div>
        )
    }

    const showCreateOwnWorkspace = groups.length === 0 || !groups.some((g) => g.isGroupAdmin)

    // Deliberate navigation always lands on the group's firm picker, even for a single-firm
    // group — the auto-select-the-one-firm shortcut is reserved for the sign-in/sign-up
    // `?entry=auth` auto-routing path (resolveDefaultFirmLandingPath), not for someone who
    // explicitly clicked a group card here.
    function navigateToGroup(group: UserGroupOption) {
        router.push(groupFirmListPath(group.slug))
    }

    function handleGroupClick(group: UserGroupOption) {
        // Only confirm when this is a genuine switch away from the group the user is
        // currently active in — clicking the current group's own card just re-enters it.
        if (currentGroupId && currentGroupId !== group.id) {
            setTargetGroup(group)
            setSwitchError(null)
            setSwitchDialogOpen(true)
            return
        }
        navigateToGroup(group)
    }

    function handleCancelSwitch() {
        if (isSwitching) return
        setSwitchError(null)
        setSwitchDialogOpen(false)
    }

    async function handleConfirmSwitch() {
        if (!targetGroup) return
        setIsSwitching(true)
        setSwitchError(null)
        try {
            // Always land on the group's firm picker after a deliberate switch — same as a
            // plain group-card click (see navigateToGroup) — even when the group has just one
            // firm. Still call switchFirm() when we know which firm to activate, so the JWT/
            // session carries the right active firm before the hard navigation.
            const firm = firms.find((f) => f.groupId === targetGroup.id)
            if (firm) {
                // Same as FirmSwitchDialog: update JWT/session before a hard navigation so the
                // target route loads with fresh permissions rather than a stale prefetch.
                await switchFirm(firm.slug)
                const { supabase } = await import('@/lib/supabase')
                await supabase.auth.refreshSession()
                const { buildUserSettingsPlus } = await import('@/lib/actions/user-settings')
                await buildUserSettingsPlus()
            }
            window.location.href = groupFirmListPath(targetGroup.slug)
        } catch (err: any) {
            setSwitchError(err?.message || 'Failed to switch workspace')
            setIsSwitching(false)
        }
    }

    async function handleCreateOwnWorkspace() {
        setCreating(true)
        setCreateError(null)
        const result = await createOwnWorkspace()
        if ('path' in result) {
            router.push(result.path)
        } else {
            setCreateError(result.error)
            setCreating(false)
        }
    }

    return (
        <TooltipProvider>
        <div className="flex flex-col h-full overflow-y-auto">
            {/* v1 only: the New UI's header bar carries the breadcrumb. */}
            {uiShell === 'v1' && (
                <nav className="flex items-center gap-1.5 mb-4">
                    <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                    <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">Firm Groups</span>
                </nav>
            )}

            <PageHeading
                icon={<LayoutGrid />}
                title={
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">Choose your firm group</span>
                        {groups.length > 0 && <span className="text-h3 font-normal tabular-nums text-fg-subtle">{groups.length}</span>}
                    </span>
                }
                description={`Select a workspace to continue in ${BRAND_NAME}`}
                actions={
                    <>
                        {groups.length > 0 && <ViewModeToggle value={viewMode} onChange={setViewMode} />}
                        {showCreateOwnWorkspace && (
                            <Button size="sm" onClick={handleCreateOwnWorkspace} disabled={creating}>
                                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Create your own workspace
                            </Button>
                        )}
                    </>
                }
            />

            {createError && <p className="mb-4 text-small text-danger">{createError}</p>}

            {groups.length > 0 && viewMode === 'list' ? (
                <WorkspaceTable
                    countLabel="Firms"
                    countIcon={<Building2 />}
                    rows={groups.map((group) => ({
                        key: group.id,
                        name: group.name,
                        icon: <LayoutGrid />,
                        badge: group.id === currentGroupId ? <Tag color="green" dot>Current</Tag> : undefined,
                        count: group.firmCount,
                        trailing: <Tag color={group.isGroupAdmin ? 'purple' : 'gray'}>{group.isGroupAdmin ? 'Group admin' : 'Group member'}</Tag>,
                        onClick: () => handleGroupClick(group),
                    }))}
                />
            ) : groups.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groups.map((group) => (
                        <WorkspaceCard
                            key={group.id}
                            name={group.name}
                            icon={<LayoutGrid />}
                            meta={`${group.firmCount} ${group.firmCount === 1 ? 'firm' : 'firms'}`}
                            badge={group.id === currentGroupId ? <Tag color="green" dot>Current</Tag> : undefined}
                            footer={<Tag color={group.isGroupAdmin ? 'purple' : 'gray'}>{group.isGroupAdmin ? 'Group admin' : 'Group member'}</Tag>}
                            onClick={() => handleGroupClick(group)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyPanel icon={<Building2 />} title="No workspaces yet" description="Create your own workspace to get started." />
            )}

            <Dialog open={switchDialogOpen} onOpenChange={handleCancelSwitch}>
                <DialogContent className="sm:max-w-[420px] p-0 gap-0">
                    <VisuallyHidden><DialogTitle>Switch Workspace</DialogTitle></VisuallyHidden>

                    <div className="px-5 py-4 border-b border-line flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded-control bg-surface-muted text-fg-muted flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5" />
                        </div>
                        <div>
                            <p className="text-ui font-semibold text-fg leading-tight">Switch workspace</p>
                            <p className="text-small text-fg-muted mt-0.5">You are switching to a different firm group.</p>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        {switchError && (
                            <div className="rounded-control bg-tag-red-bg px-3 py-2 text-small text-tag-red-fg">
                                {switchError}
                            </div>
                        )}
                        <p className="text-ui text-fg-muted">
                            {(() => {
                                const currentGroupName = groups.find((g) => g.id === currentGroupId)?.name
                                return currentGroupName ? (
                                    <>
                                        You are about to switch from <span className="font-semibold text-fg">{currentGroupName}</span> to <span className="font-semibold text-fg">{targetGroup?.name}</span>.
                                    </>
                                ) : (
                                    <>
                                        You are about to switch to <span className="font-semibold text-fg">{targetGroup?.name}</span>.
                                    </>
                                )
                            })()}
                        </p>
                        <p className="text-small text-fg-subtle">
                            Your permissions will be refreshed for this workspace.
                        </p>
                    </div>

                    <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancelSwitch}
                            disabled={isSwitching}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="greenCta"
                            onClick={handleConfirmSwitch}
                            disabled={isSwitching}
                            className="min-w-[8rem]"
                        >
                            {isSwitching ? <LoadingSpinner size="sm" /> : 'Switch workspace'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </TooltipProvider>
    )
}
