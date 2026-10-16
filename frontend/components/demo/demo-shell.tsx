'use client'

import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
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
                <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                        <div className="flex min-h-full w-full flex-col px-4 py-5 md:px-8 md:py-6">{children}</div>
                    </div>
                </main>
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
