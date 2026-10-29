'use client'

import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BarChart3, Briefcase, Building2, CalendarDays, ChevronRight, ClipboardList, Folder, Home, Inbox, LayoutGrid, LifeBuoy, Menu, MessagesSquare, Search, Settings, Users } from 'lucide-react'
import { WindowGlyph } from '@/components/ui/window-glyph'
import { ClientIcon } from '@/components/ui/client-icon'
import { cn } from '@/lib/utils'
import { DEMO_FIRM, getDemoClient } from '@/lib/demo/static-demo-data'
import { DemoTourTopbarButton } from '@/components/demo/demo-tour-topbar-button'
import { DemoTourSignupButton } from '@/components/demo/demo-tour-signup-button'
import { demoFirmView } from '@/components/demo/demo-sidebar'

type Crumb = { label: string; href?: string; icon?: ReactNode }

/** The same names and icons as the app's HeaderBar (components/shell/header-bar.tsx). */
const FIRM_VIEWS: Record<string, Crumb> = {
    analytics: { label: 'Overview', icon: <BarChart3 /> },
    clients: { label: 'Clients', icon: <ClientIcon /> },
    calendar: { label: 'Calendar', icon: <CalendarDays /> },
    'doc-search': { label: 'Doc Search', icon: <Search /> },
    members: { label: 'Members', icon: <Users /> },
    audit: { label: 'Audit', icon: <ClipboardList /> },
    settings: { label: 'Settings', icon: <Settings /> },
}

const ENGAGEMENT_TABS: Record<string, Crumb> = {
    analytics: { label: 'Overview', icon: <BarChart3 /> },
    files: { label: 'Files', icon: <Folder /> },
    board: { label: 'Board', icon: <LayoutGrid /> },
    comments: { label: 'Discussions', icon: <MessagesSquare /> },
    audit: { label: 'Audit', icon: <ClipboardList /> },
    members: { label: 'Members', icon: <Users /> },
    settings: { label: 'Settings', icon: <Settings /> },
}

function useDemoCrumbs(): Crumb[] {
    const pathname = usePathname() ?? ''
    const tab = useSearchParams()?.get('tab') ?? null
    if (pathname === '/tour/home') return [{ label: 'Home', icon: <Home /> }]
    if (pathname === '/tour/inbox') return [{ label: 'Inbox', icon: <Inbox /> }]
    if (pathname === '/tour/support') return [{ label: 'Support', icon: <LifeBuoy /> }]

    const firm: Crumb = { label: DEMO_FIRM.name, href: '/tour', icon: <Building2 /> }
    const view = demoFirmView(pathname, tab)
    if (view) return [firm, FIRM_VIEWS[view] ?? FIRM_VIEWS.clients]

    const [, , clientSlug, engagementSlug] = pathname.split('/')
    const client = clientSlug ? getDemoClient(clientSlug) : undefined
    if (!client) return [firm]
    const crumbs: Crumb[] = [firm, { label: client.name, href: `/tour/${client.slug}`, icon: <ClientIcon /> }]
    const engagement = engagementSlug ? client.engagements.find((e) => e.slug === engagementSlug) : undefined
    if (!engagement) return crumbs
    crumbs.push({ label: engagement.name, href: `/tour/${client.slug}/${engagement.slug}`, icon: <Briefcase /> })
    if (tab && ENGAGEMENT_TABS[tab]) crumbs.push(ENGAGEMENT_TABS[tab])
    return crumbs
}

function CrumbIcon({ icon }: { icon?: ReactNode }) {
    if (!icon) return null
    return <span className="flex shrink-0 items-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>{icon}</span>
}

/** Static counterpart to HeaderBar: breadcrumbs, then the tour, Sign up and the Inbox. */
export function DemoHeaderBar({ onOpenMobileNav, inboxCount, sidebarCollapsed = false, onExpandSidebar }: {
    onOpenMobileNav: () => void
    inboxCount: number
    /** As the app's header: an expand button while the sidebar is collapsed. */
    sidebarCollapsed?: boolean
    onExpandSidebar?: () => void
}) {
    const crumbs = useDemoCrumbs()
    const pathname = usePathname() ?? ''

    return (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
            <button
                type="button"
                onClick={onOpenMobileNav}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
                aria-label="Open navigation"
            >
                <Menu className="h-4 w-4" />
            </button>
            {sidebarCollapsed && onExpandSidebar && (
                <button
                    type="button"
                    onClick={onExpandSidebar}
                    className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:flex"
                    title="Expand sidebar  ["
                    aria-label="Expand sidebar"
                >
                    <WindowGlyph variant="left" filled={false} />
                </button>
            )}

            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-ui">
                {crumbs.map((crumb, i) => {
                    const last = i === crumbs.length - 1
                    return (
                        <Fragment key={`${crumb.label}-${i}`}>
                            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />}
                            {crumb.href && !last ? (
                                <Link
                                    href={crumb.href}
                                    className={cn(
                                        'flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg',
                                        i < crumbs.length - 2 && 'hidden sm:flex',
                                    )}
                                >
                                    <CrumbIcon icon={crumb.icon} />
                                    <span className="truncate">{crumb.label}</span>
                                </Link>
                            ) : (
                                <span className={cn('flex min-w-0 items-center gap-1.5 px-1.5 py-0.5', last ? 'font-medium text-fg' : 'text-fg-muted')} aria-current={last ? 'page' : undefined}>
                                    <CrumbIcon icon={crumb.icon} />
                                    <span className="truncate">{crumb.label}</span>
                                </span>
                            )}
                        </Fragment>
                    )
                })}
            </nav>

            <div className="flex shrink-0 items-center gap-1">
                <DemoTourSignupButton />
                <DemoTourTopbarButton />
                <Link
                    href="/tour/inbox"
                    className={cn(
                        'relative flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg',
                        pathname === '/tour/inbox' && 'bg-surface-selected text-fg',
                    )}
                    aria-label={inboxCount > 0 ? `Inbox, ${inboxCount} need${inboxCount === 1 ? 's' : ''} you` : 'Inbox'}
                >
                    <Inbox className="h-4 w-4" />
                    {inboxCount > 0 && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-action" />}
                </Link>
            </div>
        </header>
    )
}
