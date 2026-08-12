import Link from 'next/link'
import { Suspense } from 'react'
import { Search } from 'lucide-react'
import Logo from '@/components/Logo'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DemoSidebar } from '@/components/demo/demo-sidebar'
import { DemoCursor } from '@/components/demo/demo-cursor'
import { DemoRemindersButton, DemoRecentsButton, DemoBookmarksButton } from '@/components/demo/demo-topbar-panels'
import { DemoTourProvider } from '@/lib/demo/demo-tour-context'
import { DemoTourShell } from '@/components/demo/demo-tour-shell'
import { DemoTourTopbarButton } from '@/components/demo/demo-tour-topbar-button'
import { DemoTourSignupButton } from '@/components/demo/demo-tour-signup-button'

const TOP_BAR_HEIGHT = 64

/**
 * Static, unauthenticated shell replicating the real app chrome
 * (frontend/app/(app)/d/d-layout-client.tsx + app-sidebar.tsx + app-topbar.tsx)
 * with all live-data widgets (search results, notifications, firm switcher, etc.)
 * removed or rendered inert — visuals only, no fetching, no auth.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
    return (
        <TooltipProvider delayDuration={400}>
        <DemoTourProvider>
            <DemoCursor />
            <Suspense fallback={null}>
                <DemoTourShell />
            </Suspense>
            <div className="d-app h-screen flex flex-col overflow-hidden bg-[#f9f9fb]">
                {/* Header — matches real app-topbar.tsx shell */}
                <header
                    className="w-full bg-white border-b border-[#e5e7eb] flex items-center shrink-0 z-50"
                    style={{ height: TOP_BAR_HEIGHT }}
                >
                    <div className="flex h-full w-full items-center px-4 gap-4">
                        <div className="shrink-0 max-w-[280px] flex items-center pl-1">
                            <Link href="/">
                                <Logo size="lg" showText wordmarkClassName="font-headline text-2xl font-bold tracking-tighter" />
                            </Link>
                        </div>
                        <div className="flex-1 flex justify-center px-12">
                            <div data-demo-tour="command-palette" className="flex items-center gap-2.5 w-full max-w-sm bg-[#f9f9fb] border border-[#e5e7eb] rounded-sm px-3 py-2 text-sm text-[#45474c]/60">
                                <Search className="h-4 w-4 shrink-0" />
                                <span className="flex-1 text-left">Search is disabled in this demo</span>
                            </div>
                        </div>
                        <div className="shrink-0 flex items-center justify-end gap-2 pr-4">
                            <DemoTourSignupButton />
                            <div className="flex items-center gap-1">
                                <DemoTourTopbarButton />
                                <DemoRemindersButton />
                                <DemoRecentsButton />
                                <DemoBookmarksButton />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Body row: sidebar | main — matches real d-layout-client.tsx */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar — matches real app-sidebar.tsx (inline variant) */}
                    <div className="bg-white border-r border-[#e5e7eb] flex flex-col shrink-0 overflow-visible relative z-20 w-64">
                        <Suspense fallback={null}>
                            <DemoSidebar />
                        </Suspense>
                    </div>

                    {/* Main content — matches real d-layout-client.tsx pearl bg + architectural dot pattern */}
                    <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#f9f9fb] relative">
                        <div className="absolute inset-0 architectural-dot opacity-[0.15] pointer-events-none" />
                        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                            <div className="w-full px-6 pt-6 pb-6 min-h-full flex flex-col">{children}</div>
                        </div>
                    </main>
                </div>
            </div>
        </DemoTourProvider>
        </TooltipProvider>
    )
}
