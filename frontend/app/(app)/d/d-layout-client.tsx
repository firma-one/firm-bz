"use client"

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppTopbar } from '@/components/app/app-topbar'
import { LayoutRightPanel, RIGHT_PANEL_DOCKED_WIDTH_PX } from '@/components/app/layout-right-panel'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { ViewAsProvider } from '@/lib/view-as-context'
import { RightPaneProvider, useRightPane } from '@/lib/right-pane-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarFirmsProvider, useSidebarFirms } from '@/lib/sidebar-firms-context'
import { OnboardingProvider } from '@/lib/onboarding-context'
import { OnboardingSidebar } from '@/components/onboarding/onboarding-sidebar'
import { DebugFloatingTrigger } from '@/components/debug/debug-floating-trigger'
import { StandardCheckoutIntentBanner } from '@/components/billing/standard-checkout-intent-banner'
import { OnboardingExitGuardBanner } from '@/components/onboarding/onboarding-exit-guard-banner'
import { AppShellHintStrip } from '@/components/layout/app-shell-hint-strip'
import { useFirmMaintenanceStatus } from '@/lib/hooks/use-firm-maintenance-status'
import { usePlatformMaintenanceStatus } from '@/lib/hooks/use-platform-maintenance-status'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/toast'
import { Megaphone } from 'lucide-react'

const TOP_BAR_HEIGHT = 64
/** Matches Tailwind `spacing-3` (`mx-3` / `ml-3` on the fixed rails). */
const SIDE_INSET_PX = 12
/**
 * Gap between top bar and the row below, and between left rail and middle pane.
 * (Horizontal gap = paddingLeft − side inset − sidebar width — keep formula in sync.)
 */
const PANE_GUTTER_PX = 8
const BOTTOM_INSET_PX = 10
const RIGHT_PANEL_GAP_PX = 6

function AppLayoutContent({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const { isCollapsed } = useSidebar()
    const { content: rightPaneContent, title: rightPaneTitle, clearPane, headerActions: rightPaneHeaderActions, headerIcon, headerSubtitle } = useRightPane()
    const { session } = useAuth()
    const { addToast } = useToast()
    const accessToken = session?.access_token ?? null
    const firms = useSidebarFirms()

    // Slim onboarding rail for the whole flow; full AppSidebar only after navigation away (e.g. to /d/f/...).
    const showOnboardingSidebar =
        pathname === '/d/onboarding' || (pathname?.startsWith('/d/onboarding/') ?? false)

    // Reset right pane on navigation or reload so state is not persisted
    useEffect(() => {
        clearPane()
    }, [pathname, clearPane])

    const sidebarWidth = isCollapsed ? 64 : 256

    // Resolve current firm id from slug in pathname (e.g. /d/f/<slug>/...)
    const slugMatch = pathname?.match(/^\/d\/f\/([^/]+)/)
    const currentSlug = slugMatch?.[1] ?? null
    const currentFirmId = currentSlug
        ? (firms?.find((f) => f.slug === currentSlug)?.id ?? null)
        : null

    const maintenanceStatus = useFirmMaintenanceStatus(currentFirmId, accessToken, 15_000)
    const prevActiveRef = useRef<boolean | null>(null)

    useEffect(() => {
        const isActive = maintenanceStatus?.active === true
        if (prevActiveRef.current === true && !isActive && maintenanceStatus !== null) {
            addToast({
                title: 'Workspace ready',
                message: 'Migration complete — workspace is back online.',
                type: 'success',
            })
            window.location.reload()
        }
        if (maintenanceStatus !== null) {
            prevActiveRef.current = isActive
        }
    }, [maintenanceStatus, addToast])

    // Platform-wide maintenance: poll every 20s. Redirect on full activation.
    // Also show a grace-period countdown banner ("maintenance in X:XX") before sessions are killed.
    const platformStatus = usePlatformMaintenanceStatus(20_000)
    const [graceCountdown, setGraceCountdown] = useState<string | null>(null)

    useEffect(() => {
        if (platformStatus?.active === true) {
            window.location.href = '/platform-maintenance'
        }
    }, [platformStatus])

    // Live countdown ticker during grace period
    useEffect(() => {
        if (!platformStatus?.pendingGrace || !platformStatus.graceEndsAt) {
            setGraceCountdown(null)
            return
        }
        function tick() {
            const ms = new Date(platformStatus!.graceEndsAt!).getTime() - Date.now()
            if (ms <= 0) { setGraceCountdown('0:00'); return }
            const totalSecs = Math.ceil(ms / 1000)
            const m = Math.floor(totalSecs / 60)
            const s = totalSecs % 60
            setGraceCountdown(`${m}:${String(s).padStart(2, '0')}`)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [platformStatus])

    return (
        <AuthGuard>
            {/* Page background: slate-50 (#F7F7F7 under .d-app). h-screen + min-h-0 + overflow-hidden so only <main> scrolls — content cannot scroll behind the fixed top bar. */}
            <div className="d-app flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50">
                {/* Top bar - Branding + Alerts (white card) */}
                <div
                    className="fixed top-0 left-0 right-0 z-50 mx-3 rounded-b-xl border border-slate-200/80 border-b-slate-200 bg-white shadow-sm flex items-center"
                    style={{ height: TOP_BAR_HEIGHT }}
                >
                    <AppTopbar />
                </div>

                {/* Left app bar - menu (white card), fixed; same width; overflow-visible so expand/collapse button is not clipped */}
                <div
                    className="fixed left-0 z-40 mt-0 ml-3 rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-visible transition-all duration-300 flex flex-col"
                    style={{
                        top: TOP_BAR_HEIGHT + PANE_GUTTER_PX,
                        bottom: BOTTOM_INSET_PX,
                        width: sidebarWidth,
                    }}
                >
                    {showOnboardingSidebar ? (
                        <OnboardingSidebar />
                    ) : (
                        <AppSidebar variant="inline" />
                    )}
                </div>

                {/* Middle pane + Right bar row - flex-1 min-h-0 so <main> can shrink and scroll internally. When right pane open, reserve space via padding so fixed panel doesn't overlap. */}
                <div
                    className="flex min-h-0 flex-1 gap-2"
                    style={{
                        paddingLeft: sidebarWidth + SIDE_INSET_PX + PANE_GUTTER_PX,
                        paddingTop: TOP_BAR_HEIGHT + PANE_GUTTER_PX,
                        paddingBottom: BOTTOM_INSET_PX,
                        paddingRight: rightPaneContent ? RIGHT_PANEL_DOCKED_WIDTH_PX + RIGHT_PANEL_GAP_PX + BOTTOM_INSET_PX : BOTTOM_INSET_PX,
                    }}
                >
                    {/*
                      Middle pane: flex column — scroll area first, then bottom strips (e.g. checkout hint)
                      so hints span the white card only, not the fixed sidebar.
                    */}
                    <main className="z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
                        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="w-full px-7 pt-3 pb-4 sm:px-10 md:px-12">{children}</div>
                        </div>
                        <StandardCheckoutIntentBanner />
                        {platformStatus?.pendingGrace && graceCountdown !== null && (
                            <AppShellHintStrip
                                accent="slate"
                                noShadow
                                leading={
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 ring-1 ring-red-300">
                                        <Megaphone className="h-3.5 w-3.5 text-red-600 fill-red-200" />
                                    </div>
                                }
                                title={
                                    <span className="text-sm inline-flex items-baseline gap-1.5">
                                        Platform maintenance begins in{' '}
                                        <span className="font-mono tabular-nums font-bold text-red-600">{graceCountdown}</span>
                                        {' '}— please save any open work
                                    </span>
                                }
                                description="All active sessions will be signed out automatically. You can sign back in once maintenance is complete."
                            />
                        )}
                        {maintenanceStatus?.active === true && (
                            <AppShellHintStrip
                                accent="amber"
                                title="Workspace maintenance in progress"
                                description={`Files are being migrated · Est. ${maintenanceStatus.estimatedMinutes ?? '?'} min remaining`}
                            />
                        )}
                    </main>
                </div>

                {/* Right panel - fixed position so width cannot be shrunk by flex; always 320px visible */}
                {rightPaneContent ? (
                    <LayoutRightPanel
                        title={rightPaneTitle || 'Document'}
                        icon={headerIcon}
                        subtitle={headerSubtitle || undefined}
                        onClose={clearPane}
                        headerActions={rightPaneHeaderActions}
                        embedContent={true}
                        dockedPosition={{ top: TOP_BAR_HEIGHT + PANE_GUTTER_PX, bottom: BOTTOM_INSET_PX, right: BOTTOM_INSET_PX, widthPx: RIGHT_PANEL_DOCKED_WIDTH_PX }}
                    >
                        {rightPaneContent}
                    </LayoutRightPanel>
                ) : null}
                <OnboardingExitGuardBanner />
                <DebugFloatingTrigger />
            </div>
        </AuthGuard>
    )
}

export function DLayoutClient({
    children,
    initialFirms,
}: {
    children: React.ReactNode
    initialFirms: { id: string; name: string; slug: string; isDefault: boolean; createdAt: string }[]
}) {
    return (
        <OnboardingProvider>
            <SidebarFirmsProvider firms={initialFirms}>
                <SidebarProvider>
                    <ViewAsProvider>
                        <RightPaneProvider>
                            <TooltipProvider delayDuration={400}>
                                <AppLayoutContent>
                                    {children}
                                </AppLayoutContent>
                            </TooltipProvider>
                        </RightPaneProvider>
                    </ViewAsProvider>
                </SidebarProvider>
            </SidebarFirmsProvider>
        </OnboardingProvider>
    )
}
