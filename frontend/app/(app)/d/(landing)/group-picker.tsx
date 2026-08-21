'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ArrowRight, Loader2, SquarePlus, Home, ChevronRight, LayoutGrid } from 'lucide-react'
import { getUserGroups, getUserFirms, createOwnWorkspace, type UserGroupOption } from '@/lib/actions/firms'
import { BRAND_NAME } from '@/config/brand'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">Firm Groups</span>
            </nav>

            {/* Page header */}
            <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                    <Building2 className="h-10 w-10 text-[#1b1b1d]" />
                </div>
                <div>
                    <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                        Choose your firm group
                    </h1>
                    <p className="text-sm text-[#45474c] mt-1">Select a workspace to continue in {BRAND_NAME}</p>
                </div>
            </div>

            <Tabs defaultValue="groups" className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0">
                    <div className="flex items-center justify-between h-14 pr-4">
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            <TabsTrigger
                                value="groups"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                Firm Groups
                                {groups.length > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {groups.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        {showCreateOwnWorkspace && (
                        <button
                            type="button"
                            disabled={creating}
                            className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                            onClick={handleCreateOwnWorkspace}
                        >
                            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SquarePlus className="h-3.5 w-3.5" />}
                            Create Your Own Workspace
                        </button>
                        )}
                    </div>
                </div>

                <TabsContent value="groups" className="flex-1 mt-0">
                <div className="w-full">

                {createError && (
                    <p className="text-sm text-red-600 mb-4">{createError}</p>
                )}

                {groups.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {groups.map((group) => (
                            <button
                                key={group.id}
                                type="button"
                                className="group relative flex flex-col gap-4 p-5 rounded border bg-white shadow-md hover:shadow-lg text-left transition-all overflow-hidden h-48 border-[#e5e7eb] hover:border-primary/40"
                                onClick={() => handleGroupClick(group)}
                            >
                                {/* Brand corner decoration — groups have no theme color, plain primary accent */}
                                <svg className="absolute bottom-0 right-0 pointer-events-none" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <polygon points="48,0 48,48 0,48" fill="hsl(var(--primary))" fillOpacity="0.12" />
                                    <polygon points="48,22 48,48 22,48" fill="hsl(var(--primary))" />
                                </svg>
                                <div className="flex items-start justify-between">
                                    <div className="h-12 w-12 rounded flex items-center justify-center flex-shrink-0 overflow-hidden border">
                                        <Building2 className="h-6 w-6 text-primary" />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <p className="font-bold text-[#1b1b1d] text-base leading-tight">{group.name}</p>
                                    </div>
                                    <p className="text-xs text-[#45474c]/70">
                                        {group.firmCount} {group.firmCount === 1 ? 'firm' : 'firms'}
                                    </p>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm w-fit text-primary bg-primary/10">
                                    Continue <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                </div>
                </TabsContent>
            </Tabs>

            <Dialog open={switchDialogOpen} onOpenChange={handleCancelSwitch}>
                <DialogContent className="sm:max-w-[420px] border-[#e5e7eb] p-0 gap-0 rounded">
                    <VisuallyHidden><DialogTitle>Switch Workspace</DialogTitle></VisuallyHidden>

                    <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Switch Workspace</p>
                            <p className="text-xs text-[#45474c] mt-0.5">You are switching to a different firm group.</p>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        {switchError && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                                {switchError}
                            </div>
                        )}
                        <p className="text-sm text-[#45474c]">
                            {(() => {
                                const currentGroupName = groups.find((g) => g.id === currentGroupId)?.name
                                return currentGroupName ? (
                                    <>
                                        You are about to switch from <span className="font-semibold text-[#1b1b1d]">{currentGroupName}</span> to <span className="font-semibold text-[#1b1b1d]">{targetGroup?.name}</span>.
                                    </>
                                ) : (
                                    <>
                                        You are about to switch to <span className="font-semibold text-[#1b1b1d]">{targetGroup?.name}</span>.
                                    </>
                                )
                            })()}
                        </p>
                        <p className="text-xs text-[#9a9ba0]">
                            Your permissions will be refreshed for this workspace.
                        </p>
                    </div>

                    <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="!rounded text-[10px] font-headline font-bold tracking-widest uppercase border-gray-300"
                            onClick={handleCancelSwitch}
                            disabled={isSwitching}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="greenCta"
                            onClick={handleConfirmSwitch}
                            disabled={isSwitching}
                            className="min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase"
                        >
                            {isSwitching ? <LoadingSpinner size="sm" /> : 'Switch Workspace'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </TooltipProvider>
    )
}
