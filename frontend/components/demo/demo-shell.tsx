'use client'

import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { LayoutRightPanel } from '@/components/app/layout-right-panel'
import { RightPaneProvider, useRightPane } from '@/lib/right-pane-context'
import { SidebarProvider } from '@/lib/sidebar-context'
import { DemoPaneMarker } from '@/components/demo/demo-pane'
import { cn } from '@/lib/utils'
import { applyNewUi, clearNewUi } from '@/lib/ui-shell'
import { DemoSidebar } from '@/components/demo/demo-sidebar'
import { DemoHeaderBar } from '@/components/demo/demo-header-bar'
import { demoInboxCount } from '@/lib/demo/demo-personal-data'

/**
 * Static counterpart to AppShellV2 (components/shell/app-shell-v2.tsx): the same frame — a 240px
 * sidebar, the header bar, and the content column with the app's padding — so the demo looks like
 * the product it demonstrates. Marks <html> as the app while mounted, which switches typography to
 * Inter (app/ui-tokens.css), exactly as the /d tree does.
 */
export function DemoShell({ children }: { children: ReactNode }) {
    // The app's right pane, docked beside the content as AppShellV2 docks it, so a page in the tour
    // opens its pane (the summary review) exactly as the app does. The sidebar context only exists
    // because the pane collapses the app's sidebar when it opens; the tour's sidebar ignores it.
    return (
        <SidebarProvider>
            <RightPaneProvider>
                <DemoShellFrame>{children}</DemoShellFrame>
            </RightPaneProvider>
        </SidebarProvider>
    )
}

/** The docked pane, as d-layout-client.tsx renders it into AppShellV2's `rightPane` slot. */
function DemoRightPane() {
    const { content, contentKey, title, clearPane, canClose, headerActions, headerIcon, iconTooltip, headerSubtitle, paneSize } = useRightPane()
    return (
        <>
            {/* The tour's floating buttons sit bottom-right; they step aside while a pane is docked there. */}
            <DemoPaneMarker open={!!content} />
            {content && (
                <div
                    className={cn(
                        // Docked beside the content on desktop; a full-height overlay below 1024px (as AppShellV2).
                        'fixed inset-y-0 right-0 z-[110] flex w-full flex-col border-l border-line bg-surface shadow-dialog sm:w-[480px]',
                        'lg:static lg:z-auto lg:shadow-none',
                        paneSize === 'medium' ? 'lg:w-[50vw]' : 'lg:w-[420px]',
                    )}
                >
                    <LayoutRightPanel
                        title={title || 'Document'}
                        icon={headerIcon}
                        iconTooltip={iconTooltip || undefined}
                        subtitle={headerSubtitle || undefined}
                        onClose={clearPane}
                        beforeClose={canClose}
                        headerActions={headerActions}
                        embedContent={true}
                        frame="flush"
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={contentKey}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.15, ease: 'easeInOut' }}
                                className="flex min-h-0 flex-1 flex-col"
                            >
                                {content}
                            </motion.div>
                        </AnimatePresence>
                    </LayoutRightPanel>
                </div>
            )}
        </>
    )
}

function DemoShellFrame({ children }: { children: ReactNode }) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false)

    useLayoutEffect(() => {
        applyNewUi()
        return clearNewUi
    }, [])

    // Due dates count from the viewer's today, so the badge is worked out in the browser.
    const [inboxCount, setInboxCount] = useState(0)
    useEffect(() => setInboxCount(demoInboxCount(new Date())), [])

    return (
        <div className="flex h-screen overflow-hidden bg-surface text-fg">
            <aside className="hidden w-60 shrink-0 overflow-hidden border-r border-line lg:flex">
                <Suspense fallback={null}>
                    <DemoSidebar inboxCount={inboxCount} />
                </Suspense>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <Suspense fallback={<div className="h-11 shrink-0 border-b border-line" />}>
                    <DemoHeaderBar onOpenMobileNav={() => setMobileNavOpen(true)} inboxCount={inboxCount} />
                </Suspense>
                <div className="flex min-h-0 flex-1">
                    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="flex min-h-full w-full flex-col px-4 py-5 md:px-8 md:py-6">{children}</div>
                        </div>
                    </main>
                    <DemoRightPane />
                </div>
            </div>

            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent side="left" hideClose className="w-72 max-w-[85vw] border-r-0 p-0 sm:max-w-[288px]">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <div className="h-full" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMobileNavOpen(false) }}>
                        <Suspense fallback={null}>
                            <DemoSidebar inboxCount={inboxCount} />
                        </Suspense>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
