"use client"

import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronRight, Inbox, Menu, PanelLeftOpen } from "lucide-react"
import { AiCreditsIndicator } from "@/components/app/ai-credits-indicator"
import { clientPath, engagementPath, firmPath } from "@/lib/navigation/firm-paths"
import { useDailyDigestToast } from "./use-daily-digest-toast"
import { cn } from "@/lib/utils"
import { useShellData } from "./shell-data-context"

type Crumb = { label: string; href?: string }

const FIRM_TABS: Record<string, string> = {
    analytics: "Overview",
    clients: "Clients",
    calendar: "Calendar",
    "doc-search": "Doc Search",
    members: "Members",
    audit: "Audit",
    settings: "Settings",
}

const ENGAGEMENT_TABS: Record<string, string> = {
    analytics: "Overview",
    files: "Files",
    shares: "Board",
    board: "Board",
    comments: "Comments",
    wiki: "Dossier",
    audit: "Audit",
    members: "Members",
    settings: "Settings",
    sources: "Sources",
}

const PERSONAL_PAGES: Record<string, string> = {
    "/d/u/profile": "Profile",
    "/d/u/notifications": "Notifications",
    "/d/u/reminders": "Reminders",
    "/d/u/bookmarks": "Bookmarks",
    "/d/u/recent": "Recent",
    "/d/support": "Support",
    "/d/billing": "Billing",
}

function humanize(slug: string): string {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Breadcrumbs from the URL, named from the shell's (membership-filtered) client/engagement data. */
function useBreadcrumbs(): Crumb[] {
    const pathname = usePathname() ?? ""
    const tab = useSearchParams()?.get("tab") ?? null
    const { data, firms } = useShellData()

    const m = pathname.match(/^\/d\/([^/]+)\/f\/([^/]+)(?:\/c\/([^/]+)(?:\/e\/([^/]+)(?:\/([^/]+))?)?)?/)
    if (!m) {
        const page = Object.entries(PERSONAL_PAGES).find(([prefix]) => pathname.startsWith(prefix))
        if (page) return [{ label: page[1] }]
        return [{ label: "Workspaces" }]
    }

    const [, g, f, c, e, sub] = m
    const firmName = data?.firm.slug === f ? data.firm.name : (firms.find((x) => x.slug === f)?.name ?? humanize(f))
    const crumbs: Crumb[] = [{ label: firmName, href: firmPath(g, f) }]

    if (!c) {
        if (pathname.endsWith("/inbox")) crumbs.push({ label: "Inbox" })
        else if (tab && FIRM_TABS[tab]) crumbs.push({ label: FIRM_TABS[tab] })
        else if (pathname.endsWith("/audit")) crumbs.push({ label: "Audit" })
        return crumbs
    }

    const client = data?.clients.find((x) => x.slug === c)
    crumbs.push({ label: client?.name ?? humanize(c), href: clientPath(g, f, c) })
    if (!e) return crumbs

    const engagement = client?.engagements.find((x) => x.slug === e)
    crumbs.push({ label: engagement?.name ?? humanize(e), href: engagementPath(g, f, c, e) })
    if (sub && ENGAGEMENT_TABS[sub]) crumbs.push({ label: ENGAGEMENT_TABS[sub] })
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
    const { firmSlug, groupSlug, data, firms, inboxCountFor } = useShellData()
    const inboxHref = firmSlug && groupSlug ? `${firmPath(groupSlug, firmSlug)}/inbox` : "/d/u/notifications"
    const inboxCount = inboxCountFor(data?.firm.id ?? firms.find((f) => f.slug === firmSlug)?.id)
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
                            {crumb.href && !last ? (
                                <Link
                                    href={crumb.href}
                                    className={cn(
                                        "min-w-0 truncate rounded-control px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
                                        // On phones only the last two crumbs fit.
                                        i < crumbs.length - 2 && "hidden sm:block"
                                    )}
                                >
                                    {crumb.label}
                                </Link>
                            ) : (
                                <span className={cn("min-w-0 truncate px-1.5 py-0.5", last ? "font-medium text-fg" : "text-fg-muted")} aria-current={last ? "page" : undefined}>
                                    {crumb.label}
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
