"use client"

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppTopbar } from '@/components/app/app-topbar'
import { LayoutRightPanel, RIGHT_PANEL_DOCKED_WIDTH_PX, RIGHT_PANEL_MEDIUM_WIDTH_PX } from '@/components/app/layout-right-panel'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { ViewAsProvider } from '@/lib/view-as-context'
import { RightPaneProvider, useRightPane } from '@/lib/right-pane-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarFirmsProvider, useSidebarFirms } from '@/lib/sidebar-firms-context'
import { OnboardingProvider } from '@/lib/onboarding-context'
import { OnboardingSidebar } from '@/components/onboarding/onboarding-sidebar'
import { DownloadProgressProvider } from '@/lib/download-progress-context'
import { DownloadProgressPanel } from '@/components/ui/download-progress-panel'
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

function AppLayoutContent({ children, isSystemAdmin }: { children: React.ReactNode; isSystemAdmin?: boolean }) {
    const pathname = usePathname()
    const { isCollapsed } = useSidebar()
    const { content: rightPaneContent, title: rightPaneTitle, clearPane, headerActions: rightPaneHeaderActions, headerIcon, headerSubtitle, paneSize } = useRightPane()
    const { session } = useAuth()
    const { addToast } = useToast()
    const accessToken = session?.access_token ?? null
    const firms = useSidebarFirms()

    const showOnboardingSidebar =
        pathname === '/d/onboarding' || (pathname?.startsWith('/d/onboarding/') ?? false)

    useEffect(() => { clearPane() }, [pathname, clearPane])

    const sidebarWidth = isCollapsed ? 64 : 256

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
            addToast({ title: 'Workspace ready', message: 'Migration complete — workspace is back online.', type: 'success' })
            window.location.reload()
        }
        if (maintenanceStatus !== null) prevActiveRef.current = isActive
    }, [maintenanceStatus, addToast])

    const platformStatus = usePlatformMaintenanceStatus(20_000)
    const [graceCountdown, setGraceCountdown] = useState<string | null>(null)

    useEffect(() => {
        if (platformStatus?.active === true) window.location.href = '/platform-maintenance'
    }, [platformStatus])

    useEffect(() => {
        if (!platformStatus?.pendingGrace || !platformStatus.graceEndsAt) { setGraceCountdown(null); return }
        function tick() {
            const ms = new Date(platformStatus!.graceEndsAt!).getTime() - Date.now()
            if (ms <= 0) { setGraceCountdown('0:00'); return }
            const totalSecs = Math.ceil(ms / 1000)
            setGraceCountdown(`${Math.floor(totalSecs / 60)}:${String(totalSecs % 60).padStart(2, '0')}`)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [platformStatus])

    return (
        <AuthGuard>
            {/*
              Kinetic Institution layout — matches code.html structure:
              flex-col → [full-width header] + [flex-row → sidebar | main | right-pane]
              No floating cards on the chrome. Header: border-b. Sidebar: border-r.
              Main content: pearl bg-[#f9f9fb]. Right pane: m-4 rounded-xl shadow-xl.
            */}
            <div className="d-app h-screen flex flex-col overflow-hidden bg-[#f9f9fb]">

                {/* ── Header: full-width, border-b only ── */}
                <header
                    className="w-full bg-white border-b border-[#e5e7eb] flex items-center shrink-0 z-50"
                    style={{ height: TOP_BAR_HEIGHT }}
                >
                    <AppTopbar />
                </header>

                {/* ── Body row: sidebar | main | right pane ── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ── Left sidebar: border-r only, animates width ── */}
                    <div
                        className="bg-white border-r border-[#e5e7eb] flex flex-col shrink-0 overflow-visible transition-all duration-300 relative z-20"
                        style={{ width: sidebarWidth }}
                    >
                        {showOnboardingSidebar ? <OnboardingSidebar /> : <AppSidebar variant="inline" isSystemAdmin={isSystemAdmin} />}
                    </div>

                    {/* ── Main content: pearl bg, architectural dot pattern ── */}
                    <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#f9f9fb] relative">
                        <div className="absolute inset-0 architectural-dot opacity-[0.15] pointer-events-none" />
                        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                            <div className="w-full px-6 pt-6 pb-6 min-h-full flex flex-col">{children}</div>
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

                    {/* ── Right pane: m-4 rounded-xl shadow-xl (matches code.html) ── */}
                    {rightPaneContent ? (
                        <div
                            className="shrink-0 my-4 mr-4 transition-all duration-300"
                            style={{ width: paneSize === 'medium' ? '50vw' : RIGHT_PANEL_DOCKED_WIDTH_PX }}
                        >
                            <LayoutRightPanel
                                title={rightPaneTitle || 'Document'}
                                icon={headerIcon}
                                subtitle={headerSubtitle || undefined}
                                onClose={clearPane}
                                headerActions={rightPaneHeaderActions}
                                embedContent={true}
                            >
                                {rightPaneContent}
                            </LayoutRightPanel>
                        </div>
                    ) : null}

                </div>

                <OnboardingExitGuardBanner />
                <DebugFloatingTrigger />
            </div>
        </AuthGuard>
    )
}

export function DLayoutClient({
    children,
    initialFirms,
    isSystemAdmin,
}: {
    children: React.ReactNode
    initialFirms: { id: string; name: string; slug: string; isDefault: boolean; createdAt: string }[]
    isSystemAdmin?: boolean
}) {
    return (
        <OnboardingProvider>
            <SidebarFirmsProvider firms={initialFirms}>
                <SidebarProvider>
                    <ViewAsProvider>
                        <RightPaneProvider>
                            <DownloadProgressProvider>
                                <TooltipProvider delayDuration={400}>
                                    <AppLayoutContent isSystemAdmin={isSystemAdmin}>
                                        {children}
                                    </AppLayoutContent>
                                    <DownloadProgressPanel />
                                </TooltipProvider>
                            </DownloadProgressProvider>
                        </RightPaneProvider>
                    </ViewAsProvider>
                </SidebarProvider>
            </SidebarFirmsProvider>
        </OnboardingProvider>
    )
}
