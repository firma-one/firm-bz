"use client"

import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import { ShimmerBar } from "@/components/ui/shimmer"
import { usePathname, useSearchParams } from "next/navigation"
import { BarChart3, Briefcase, Building2, CalendarDays, ChevronRight, ClipboardList, CreditCard, Folder, Home, Inbox, LayoutGrid, LifeBuoy, Menu, MessagesSquare, PanelLeftOpen, PenTool, Search, Settings, UserCircle, Users } from "lucide-react"
import { AiCreditsIndicator } from "@/components/app/ai-credits-indicator"
import { clientPath, engagementPath, firmPath } from "@/lib/navigation/firm-paths"
import { useDailyDigestToast } from "./use-daily-digest-toast"
import { cn } from "@/lib/utils"
import { useShellData } from "./shell-data-context"

type Crumb = { label: string; href?: string; pending?: boolean; icon?: ReactNode }

// Icons are the app's existing ones: firm Building2, client Users, engagement Briefcase, and each
// tab's own icon from the sidebar or the engagement tab row.
const FIRM_TABS: Record<string, { label: string; icon: ReactNode }> = {
    analytics: { label: "Overview", icon: <BarChart3 /> },
    clients: { label: "Clients", icon: <Users /> },
    calendar: { label: "Calendar", icon: <CalendarDays /> },
    "doc-search": { label: "Doc Search", icon: <Search /> },
    members: { label: "Members", icon: <Users /> },
    audit: { label: "Audit", icon: <ClipboardList /> },
    settings: { label: "Settings", icon: <Settings /> },
}

const ENGAGEMENT_TABS: Record<string, { label: string; icon: ReactNode }> = {
    analytics: { label: "Overview", icon: <BarChart3 /> },
    files: { label: "Files", icon: <Folder /> },
    shares: { label: "Board", icon: <LayoutGrid /> },
    board: { label: "Board", icon: <LayoutGrid /> },
    comments: { label: "Comments", icon: <MessagesSquare /> },
    wiki: { label: "Dossier", icon: <PenTool /> },
    audit: { label: "Audit", icon: <ClipboardList /> },
    members: { label: "Members", icon: <Users /> },
    settings: { label: "Settings", icon: <Settings /> },
    sources: { label: "Sources", icon: <Folder /> },
}

// Firm-less pages, with the icons their sidebar or profile-menu entries use. The old personal
// pages (recent, reminders, notifications, bookmarks) redirect to Home and the Inbox.
const PERSONAL_PAGES: Record<string, Crumb> = {
    "/d/u/home": { label: "Home", icon: <Home /> },
    "/d/u/inbox": { label: "Inbox", icon: <Inbox /> },
    "/d/u/profile": { label: "Profile", icon: <UserCircle /> },
    "/d/support": { label: "Support", icon: <LifeBuoy /> },
    "/d/billing": { label: "Billing", icon: <CreditCard /> },
}

function humanize(slug: string): string {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function CrumbIcon({ icon }: { icon?: ReactNode }) {
    if (!icon) return null
    return <span className="flex shrink-0 items-center text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>{icon}</span>
}

/** Breadcrumbs from the URL, named from the shell's (membership-filtered) client/engagement data. */
function useBreadcrumbs(): Crumb[] {
    const pathname = usePathname() ?? ""
    const tab = useSearchParams()?.get("tab") ?? null
    const { data, firms, loading } = useShellData()

    const m = pathname.match(/^\/d\/([^/]+)\/f\/([^/]+)(?:\/c\/([^/]+)(?:\/e\/([^/]+)(?:\/([^/]+))?)?)?/)
    if (!m) {
        const page = Object.entries(PERSONAL_PAGES).find(([prefix]) => pathname.startsWith(prefix))
        if (page) return [page[1]]
        return [{ label: "Workspaces", icon: <LayoutGrid /> }]
    }

    const [, g, f, c, e, sub] = m
    const firmName = data?.firm.slug === f ? data.firm.name : (firms.find((x) => x.slug === f)?.name ?? humanize(f))
    const crumbs: Crumb[] = [{ label: firmName, href: firmPath(g, f), icon: <Building2 /> }]

    if (!c) {
        if (pathname.endsWith("/inbox")) crumbs.push({ label: "Inbox", icon: <Inbox /> })
        else if (tab && FIRM_TABS[tab]) crumbs.push(FIRM_TABS[tab])
        else if (pathname.endsWith("/audit")) crumbs.push(FIRM_TABS.audit)
        return crumbs
    }

    // Until the shell data arrives, show a placeholder rather than the slug ("Datasen Jixw").
    const pending = loading || !data
    const client = data?.clients.find((x) => x.slug === c)
    crumbs.push({ label: client?.name ?? humanize(c), href: clientPath(g, f, c), pending: !client && pending, icon: <Users /> })
    if (!e) return crumbs

    const engagement = client?.engagements.find((x) => x.slug === e)
    crumbs.push({ label: engagement?.name ?? humanize(e), href: engagementPath(g, f, c, e), pending: !engagement && pending, icon: <Briefcase /> })
    if (sub && ENGAGEMENT_TABS[sub]) crumbs.push(ENGAGEMENT_TABS[sub])
    return crumbs
}

export function HeaderBar({
    sidebarCollapsed,
    onExpandSidebar,
    onOpenMobileNav,
    actions,
}: {
    sidebarCollapsed: boolean
    onExpandSidebar: () => void
    onOpenMobileNav: () => void
    actions?: ReactNode
}) {
    const crumbs = useBreadcrumbs()
    const pathname = usePathname() ?? ""
    const { inboxTotal: inboxCount } = useShellData()
    const inboxHref = "/d/u/inbox"
    useDailyDigestToast()

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
            {sidebarCollapsed && (
                <button
                    type="button"
                    onClick={onExpandSidebar}
                    className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:flex"
                    title="Expand sidebar  ["
                    aria-label="Expand sidebar"
                >
                    <PanelLeftOpen className="h-4 w-4" />
                </button>
            )}

            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-ui">
                {crumbs.map((crumb, i) => {
                    const last = i === crumbs.length - 1
                    return (
                        <Fragment key={`${crumb.label}-${i}`}>
                            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />}
                            {crumb.pending ? (
                                <span className={cn("flex min-w-0 items-center gap-1.5 px-1.5 py-0.5", i < crumbs.length - 2 && "hidden sm:flex")} aria-label="Loading">
                                    <CrumbIcon icon={crumb.icon} />
                                    <ShimmerBar className="h-3 w-24" />
                                </span>
                            ) : crumb.href && !last ? (
                                <Link
                                    href={crumb.href}
                                    className={cn(
                                        "flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
                                        // On phones only the last two crumbs fit.
                                        i < crumbs.length - 2 && "hidden sm:flex"
                                    )}
                                >
                                    <CrumbIcon icon={crumb.icon} />
                                    <span className="truncate">{crumb.label}</span>
                                </Link>
                            ) : (
                                <span className={cn("flex min-w-0 items-center gap-1.5 px-1.5 py-0.5", last ? "font-medium text-fg" : "text-fg-muted")} aria-current={last ? "page" : undefined}>
                                    <CrumbIcon icon={crumb.icon} />
                                    <span className="truncate">{crumb.label}</span>
                                </span>
                            )}
                        </Fragment>
                    )
                })}
            </nav>

            <div className="flex shrink-0 items-center gap-1">
                {actions}
                <div className="hidden sm:block">
                    <AiCreditsIndicator />
                </div>
                <Link
                    href={inboxHref}
                    className={cn(
                        "relative flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
                        pathname === inboxHref && "bg-surface-selected text-fg"
                    )}
                    aria-label={inboxCount > 0 ? `Inbox, ${inboxCount} unread` : "Inbox"}
                    title="Inbox"
                >
                    <Inbox className="h-4 w-4" />
                    {inboxCount > 0 && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-action" />}
                </Link>
            </div>
        </header>
    )
}
