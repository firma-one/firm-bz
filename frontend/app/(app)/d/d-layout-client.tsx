"use client"

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppTopbar } from '@/components/app/app-topbar'
import { useViewAs, RBAC_PERSONAS } from '@/lib/view-as-context'
import { LayoutRightPanel, RIGHT_PANEL_DOCKED_WIDTH_PX } from '@/components/app/layout-right-panel'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { ViewAsProvider } from '@/lib/view-as-context'
import { RightPaneProvider, useRightPane } from '@/lib/right-pane-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarFirmsProvider, useSidebarFirms } from '@/lib/sidebar-firms-context'
import { OnboardingProvider } from '@/lib/onboarding-context'
import { OnboardingSidebar } from '@/components/onboarding/onboarding-sidebar'
import { DownloadProgressProvider } from '@/lib/download-progress-context'
import { DownloadProgressPanel } from '@/components/ui/download-progress-panel'
import { UploadProgressProvider } from '@/lib/upload-progress-context'
import { UploadProgressPanel } from '@/components/ui/upload-progress-panel'
import { MigrationProgressPanel } from '@/components/ui/migration-progress-panel'
import { DebugFloatingTrigger } from '@/components/debug/debug-floating-trigger'
import { StandardCheckoutIntentBanner } from '@/components/billing/standard-checkout-intent-banner'
import { OnboardingExitGuardBanner } from '@/components/onboarding/onboarding-exit-guard-banner'
import { AppShellHintStrip } from '@/components/layout/app-shell-hint-strip'
import { useFirmMaintenanceStatus } from '@/lib/hooks/use-firm-maintenance-status'
import { usePlatformMaintenanceStatus } from '@/lib/hooks/use-platform-maintenance-status'
import { useAuth } from '@/lib/auth-context'
import { Megaphone } from 'lucide-react'
import { DemoTourProvider, useDemoTour, readDemoTourSeen, loadTourProgress } from '@/lib/demo-tour-context'
import { DemoTour } from '@/components/app/demo-tour'
import { DemoTourIntroModal } from '@/components/app/demo-tour-intro-modal'
import { DemoTourOutroModal } from '@/components/app/demo-tour-outro-modal'
import { DemoTourButton } from '@/components/app/demo-tour-button'

const TOP_BAR_HEIGHT = 64

function DemoTourShell({ firmSlug }: { firmSlug: string }) {
    const { openIntroModal } = useDemoTour()
    const hasOpenedRef = useRef(false)

    useEffect(() => {
        if (hasOpenedRef.current) return
        const tourSeen = readDemoTourSeen()
        const savedProgress = loadTourProgress()
        // If tour is marked seen but there's saved mid-tour progress (manual restart was in-flight),
        // offer to resume. Otherwise don't auto-prompt.
        if (tourSeen && !savedProgress) return
        // Either: tour not yet seen (first time), OR seen + has in-progress step to resume
        hasOpenedRef.current = true
        const timer = setTimeout(() => { void openIntroModal(firmSlug) }, 800)
        return () => clearTimeout(timer)
    }, [firmSlug, openIntroModal])

    return (
        <>
            <DemoTour />
            <DemoTourIntroModal />
            <DemoTourOutroModal />
            <DemoTourButton firmSlug={firmSlug} />
        </>
    )
}

function ViewAsBanner() {
    const { isViewAsActive, viewAsPersonaSlug, setViewAsPersonaSlug } = useViewAs()
    if (!isViewAsActive || !viewAsPersonaSlug) return null
    const persona = RBAC_PERSONAS.find((p) => p.slug === viewAsPersonaSlug)
    return (
        <div className="w-full shrink-0 flex items-center justify-center gap-3 px-4 py-1.5 text-[0.8125rem] font-medium z-50" style={{ background: '#9f1239', color: '#ffe4e6' }}>
            <span>Viewing as: <strong>{persona?.displayName ?? viewAsPersonaSlug}</strong> — permissions are simulated</span>
            <button
                type="button"
                onClick={() => { setViewAsPersonaSlug(null); window.location.reload() }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.75rem] font-semibold transition-colors"
                style={{ background: '#ffe4e6', color: '#9f1239' }}
            >
                Exit
            </button>
        </div>
    )
}

function AppLayoutContent({ children, isSystemAdmin }: { children: React.ReactNode; isSystemAdmin?: boolean }) {
    const pathname = usePathname()
    const { isCollapsed } = useSidebar()
    const { content: rightPaneContent, contentKey: rightPaneContentKey, title: rightPaneTitle, clearPane, headerActions: rightPaneHeaderActions, headerIcon, iconTooltip, headerSubtitle, paneSize } = useRightPane()
    const { session } = useAuth()
    const accessToken = session?.access_token ?? null
    const firms = useSidebarFirms()

    const showOnboardingSidebar =
        pathname === '/d/onboarding' || (pathname?.startsWith('/d/onboarding/') ?? false)

    useEffect(() => { clearPane() }, [pathname, clearPane])

    const sidebarWidth = isCollapsed ? 64 : 256

    const slugMatch = pathname?.match(/^\/d\/f\/([^/]+)/)
    const currentSlug = slugMatch?.[1] ?? null
    const currentFirm = currentSlug ? (firms?.find((f) => f.slug === currentSlug) ?? null) : null
    const currentFirmId = currentFirm?.id ?? null
    const isDemoFirm = currentFirm?.sandboxOnly === true

    const { status: maintenanceStatus, refresh: refreshMaintenanceStatus } = useFirmMaintenanceStatus(currentFirmId, accessToken, 15_000)
    const prevActiveRef = useRef<boolean | null>(null)
    const prevMigrationStatusRef = useRef<string | null | undefined>(undefined)

    useEffect(() => {
        const isActive = maintenanceStatus?.active === true
        const migrationStatus = maintenanceStatus?.latestMigrationStatus

        // Case 1: tab saw active=true and now it's false — migration just completed
        if (prevActiveRef.current === true && !isActive && maintenanceStatus !== null) {
            window.location.reload()
            return
        }
        // Case 2: tab missed active=true (loaded mid-migration or after) — detect
        // completion via latestMigrationStatus transitioning to a terminal state
        const terminal = migrationStatus === 'completed' || migrationStatus === 'failed' || migrationStatus === 'failed_partial'
        if (
            prevMigrationStatusRef.current !== undefined &&
            prevMigrationStatusRef.current !== migrationStatus &&
            terminal
        ) {
            window.location.reload()
            return
        }

        if (maintenanceStatus !== null) {
            prevActiveRef.current = isActive
            prevMigrationStatusRef.current = migrationStatus
        }
    }, [maintenanceStatus])

    // Allow any child to trigger an immediate maintenance status refresh
    // by dispatching a `firma:refresh-maintenance` custom event on window.
    useEffect(() => {
        const handler = () => void refreshMaintenanceStatus()
        window.addEventListener('firma:refresh-maintenance', handler)
        return () => window.removeEventListener('firma:refresh-maintenance', handler)
    }, [refreshMaintenanceStatus])

    const [migrationStartedAt, setMigrationStartedAt] = useState<string | null>(null)

    useEffect(() => {
        const handler = () => {
            setMigrationStartedAt(new Date().toISOString())
            void refreshMaintenanceStatus()
        }
        window.addEventListener('firma:migration-started', handler)
        return () => window.removeEventListener('firma:migration-started', handler)
    }, [refreshMaintenanceStatus])

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
            <div className="d-app h-screen flex flex-col overflow-hidden bg-[#f9f9fb] print:h-auto print:overflow-visible print:block">

                {/* ── Header: full-width, border-b only ── */}
                <header
                    className="w-full bg-white border-b border-[#e5e7eb] flex items-center shrink-0 z-50"
                    style={{ height: TOP_BAR_HEIGHT }}
                >
                    <AppTopbar />
                </header>

                <ViewAsBanner />

                {/* ── Body row: sidebar | main | right pane ── */}
                <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">

                    {/* ── Left sidebar: border-r only, animates width ── */}
                    <div
                        className="bg-white border-r border-[#e5e7eb] flex flex-col shrink-0 overflow-visible transition-all duration-300 relative z-20"
                        style={{ width: sidebarWidth }}
                    >
                        {showOnboardingSidebar ? <OnboardingSidebar /> : <AppSidebar variant="inline" isSystemAdmin={isSystemAdmin} />}
                    </div>

                    {/* ── Main content: pearl bg, architectural dot pattern ── */}
                    <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#f9f9fb] relative print:overflow-visible print:block">
                        <div className="absolute inset-0 architectural-dot opacity-[0.15] pointer-events-none" />
                        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden print:overflow-visible print:flex-none print:h-auto">
                            <div className="w-full px-6 pt-6 pb-6 min-h-full flex flex-col print:min-h-0">{children}</div>
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
                                iconTooltip={iconTooltip || undefined}
                                subtitle={headerSubtitle || undefined}
                                onClose={clearPane}
                                headerActions={rightPaneHeaderActions}
                                embedContent={true}
                            >
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={rightPaneContentKey}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.15, ease: 'easeInOut' }}
                                        className="h-full"
                                    >
                                        {rightPaneContent}
                                    </motion.div>
                                </AnimatePresence>
                            </LayoutRightPanel>
                        </div>
                    ) : null}

                </div>

                <OnboardingExitGuardBanner />
                <DebugFloatingTrigger />
                {isDemoFirm && currentSlug && <DemoTourShell firmSlug={currentSlug} />}
                <MigrationProgressPanel
                    status={maintenanceStatus}
                    migrationStartedAt={migrationStartedAt}
                    onMigrationStartedAtClear={() => setMigrationStartedAt(null)}
                    firmId={currentFirmId}
                    accessToken={accessToken}
                    onCancelled={() => window.location.reload()}
                    onRefresh={refreshMaintenanceStatus}
                />
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
    initialFirms: { id: string; name: string; slug: string; isDefault: boolean; createdAt: string; sandboxOnly?: boolean }[]
    isSystemAdmin?: boolean
}) {
    return (
        <DemoTourProvider>
        <OnboardingProvider>
            <SidebarFirmsProvider firms={initialFirms}>
                <SidebarProvider>
                    <ViewAsProvider>
                        <RightPaneProvider>
                            <DownloadProgressProvider>
                            <UploadProgressProvider>
                                <TooltipProvider delayDuration={400}>
                                    <AppLayoutContent isSystemAdmin={isSystemAdmin}>
                                        {children}
                                    </AppLayoutContent>
                                    <DownloadProgressPanel />
                                    <UploadProgressPanel />
                                </TooltipProvider>
                            </UploadProgressProvider>
                            </DownloadProgressProvider>
                        </RightPaneProvider>
                    </ViewAsProvider>
                </SidebarProvider>
            </SidebarFirmsProvider>
        </OnboardingProvider>
        </DemoTourProvider>
    )
}
