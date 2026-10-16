"use client"

import { useCallback, useEffect, useState, type ReactNode, useRef } from "react"
import { usePathname } from "next/navigation"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { setSidebarCollapsed } from "@/lib/actions/user-ui-prefs"
import { useUiPrefs } from "@/lib/ui-shell-context"
import { cn } from "@/lib/utils"
import { HeaderBar } from "./header-bar"
import { ShellDataProvider } from "./shell-data-context"
import { SidebarV2 } from "./sidebar-v2"
import { useRecordVisits } from "./use-record-visits"
import { useBrandAccent } from "./use-brand-accent"
import { CommandMenu } from "./command-menu"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { useShellShortcuts } from "./use-shell-shortcuts"

/** Mounted inside ShellDataProvider so the shortcuts know the current firm and role. */
function ShellShortcuts({ onShowShortcuts }: { onShowShortcuts: () => void }) {
    useShellShortcuts({ onShowShortcuts })
    return null
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    if (!el) return false
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
}

/**
 * New UI app frame (.claude/plans/ui-ux-overhaul.md, Phase 2), rendered by DLayoutClient in place
 * of the legacy header/sidebar when the user's shell is v2:
 *
 *   ≥1024px  [sidebar 240px, collapsible with `[`] | [header bar + content] | [right pane]
 *   <1024px  sidebar becomes an off-canvas drawer behind the header's menu button; the right pane
 *            overlays the content instead of docking.
 *
 * Banners, progress panels and the right pane's content come from DLayoutClient so v1 and v2 share
 * exactly the same behavior; only the frame differs.
 */
export function AppShellV2({
    isSystemAdmin = false,
    banners,
    mainFooter,
    rightPane,
    rightPaneWide = false,
    overlays,
    children,
}: {
    isSystemAdmin?: boolean
    /** Full-width strips under the header (View As, demo firm). */
    banners?: ReactNode
    /** Pinned to the bottom of the content column (checkout intent, maintenance countdown). */
    mainFooter?: ReactNode
    /** The right pane panel, or null when closed. */
    rightPane?: ReactNode
    rightPaneWide?: boolean
    /** Floating panels and dialogs (progress, demo tour, onboarding guard). */
    overlays?: ReactNode
    children: ReactNode
}) {
    const { sidebarCollapsed: initialCollapsed } = useUiPrefs()
    const [collapsed, setCollapsed] = useState(initialCollapsed)
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [shortcutsOpen, setShortcutsOpen] = useState(false)
    const showShortcuts = useCallback(() => setShortcutsOpen(true), [])
    const pathname = usePathname()

    useEffect(() => {
        setMobileNavOpen(false)
    }, [pathname])

    useRecordVisits()
    useBrandAccent()

    // Persist outside the state updater. React runs updaters while rendering (twice in Strict
    // Mode), and a server action called there updates the Router mid-render — "Cannot update a
    // component (Router) while rendering AppShellV2" — and saved the preference twice.
    const collapsedRef = useRef(initialCollapsed)
    const toggleSidebar = useCallback(() => {
        const next = !collapsedRef.current
        collapsedRef.current = next
        setCollapsed(next)
        void setSidebarCollapsed(next)
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
            e.preventDefault()
            toggleSidebar()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [toggleSidebar])

    return (
        <ShellDataProvider>
            <div className="d-app flex h-screen overflow-hidden bg-surface text-fg print:block print:h-auto print:overflow-visible">
                {/* Stays mounted so collapse can animate: the width eases between 0 and 240px in
                    150ms while the content keeps its width and is clipped, so nothing reflows
                    mid-animation. Collapsed, it is inert — not focusable, not read out. */}
                <aside
                    inert={collapsed}
                    aria-hidden={collapsed || undefined}
                    className={cn(
                        "hidden shrink-0 overflow-hidden border-line lg:flex print:hidden",
                        "transition-[width] duration-150 ease-out motion-reduce:transition-none",
                        collapsed ? "w-0" : "w-60 border-r"
                    )}
                >
                    <div
                        className={cn(
                            "flex w-60 shrink-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
                            collapsed ? "opacity-0" : "opacity-100"
                        )}
                    >
                        <SidebarV2 isSystemAdmin={isSystemAdmin} onCollapse={toggleSidebar} />
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col print:block">
                    <div className="print:hidden">
                        <HeaderBar
                            sidebarCollapsed={collapsed}
                            onExpandSidebar={toggleSidebar}
                            onOpenMobileNav={() => setMobileNavOpen(true)}
                        />
                    </div>
                    {banners}

                    <div className="flex min-h-0 flex-1 print:block">
                        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
                            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible">
                                <div className="flex min-h-full w-full flex-col px-4 py-5 md:px-8 md:py-6 print:min-h-0">
                                    {children}
                                </div>
                            </div>
                            {mainFooter}
                        </main>

                        {rightPane && (
                            <div
                                className={cn(
                                    // Docked beside the content on desktop; a full-height overlay below 1024px.
                                    "fixed inset-y-0 right-0 z-[110] flex w-full flex-col border-l border-line bg-surface shadow-dialog sm:w-[480px]",
                                    "lg:static lg:z-auto lg:shadow-none",
                                    rightPaneWide ? "lg:w-[50vw]" : "lg:w-[420px]",
                                    "print:hidden"
                                )}
                            >
                                {rightPane}
                            </div>
                        )}
                    </div>
                </div>

                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                    <SheetContent side="left" hideClose className="w-72 max-w-[85vw] border-r-0 p-0 sm:max-w-[288px]">
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <SidebarV2 isSystemAdmin={isSystemAdmin} onNavigate={() => setMobileNavOpen(false)} />
                    </SheetContent>
                </Sheet>

                <CommandMenu onToggleSidebar={toggleSidebar} onShowShortcuts={showShortcuts} />
                <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
                <ShellShortcuts onShowShortcuts={showShortcuts} />
                {overlays}
            </div>
        </ShellDataProvider>
    )
}
