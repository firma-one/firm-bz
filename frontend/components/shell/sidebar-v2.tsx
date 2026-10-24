"use client"

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
    BarChart3,
    Briefcase,
    Building2,
    CalendarDays,
    ChevronRight,
    ClipboardList,
    CreditCard,
    Home,
    Inbox,
    LayoutGrid,
    LifeBuoy,
    LogOut,
    MonitorCheck,
    ExternalLink,
    Info,
    ScrollText,
    Search,
    Settings,
    UserCircle,
    Users,
} from "lucide-react"
import { WindowGlyph } from '@/components/ui/window-glyph'
import { ClientIcon } from "@/components/ui/client-icon"
import { useAuth } from "@/lib/auth-context"
import { buildBillingPageHref } from "@/lib/billing/build-billing-page-href"
import { AccessLock } from "@/components/ui/access-lock"
import { firmPath, firmTabPath, groupFirmListPath } from "@/lib/navigation/firm-paths"
import { StatusIcon } from "@/components/ui/status-icon"
import { Hint } from "@/components/ui/tooltip"
import { statusOf } from "@/lib/ui/status"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useShellData } from "./shell-data-context"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { initialsOf } from '@/lib/initials'
import { resolveDisplayName } from '@/lib/auth/display-name'

export function CountBadge({ count }: { count: number }) {
    return (
        <span className="ml-auto min-w-[1.25rem] rounded-full bg-surface-selected px-1.5 text-center text-caption tabular-nums text-fg-muted">
            {count > 99 ? "99+" : count}
        </span>
    )
}

/** Opens the command palette — the same synthetic ⌘K the legacy top bar dispatches. */
export function openCommandPalette() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
}

/** One sidebar row: icon, label, optional trailing count or lock. Shared with the public demo. */
export function SidebarItem({
    href,
    onClick,
    icon,
    label,
    active,
    trailing,
    title,
    className,
}: {
    href?: string
    onClick?: () => void
    icon?: ReactNode
    label: ReactNode
    active?: boolean
    trailing?: ReactNode
    title?: string
    className?: string
}) {
    const classes = cn(
        "group flex h-7 min-w-0 items-center gap-2 rounded-control px-2 text-ui text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30",
        active && "bg-surface-selected font-medium text-fg hover:bg-surface-selected",
        className
    )
    const content = (
        <>
            {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {trailing}
        </>
    )
    // `title` shows in the app's Hint, to the right, not as a native tooltip.
    const withHint = (el: ReactElement) => (title ? <Hint label={title} side="right">{el}</Hint> : el)
    if (href) {
        return withHint(
            <Link href={href} className={classes} aria-current={active ? "page" : undefined}>
                {content}
            </Link>
        )
    }
    return withHint(
        <button type="button" onClick={onClick} className={cn(classes, "w-full text-left")}>
            {content}
        </button>
    )
}

/** A collapsible sidebar group with a quiet caption title. Shared with the public demo. */
export function SidebarSection({
    id,
    title,
    children,
    action,
}: {
    id: string
    title: string
    children: ReactNode
    action?: ReactNode
}) {
    const storageKey = `fm_v2_sidebar_section_${id}`
    const [open, setOpen] = useState(true)
    useEffect(() => {
        try {
            if (localStorage.getItem(storageKey) === "closed") setOpen(false)
        } catch {
            /* per-viewer convenience only */
        }
    }, [storageKey])
    function toggle() {
        setOpen((o) => {
            try {
                localStorage.setItem(storageKey, o ? "closed" : "open")
            } catch {
                /* ignore */
            }
            return !o
        })
    }
    return (
        <div className="flex flex-col gap-px">
            <div className="group/section flex h-7 items-center justify-between pr-1">
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    className="flex items-center gap-1 rounded-control px-2 py-1 text-caption text-fg-subtle transition-colors hover:text-fg-muted"
                >
                    {title}
                    <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
                </button>
                {action}
            </div>
            {open && children}
        </div>
    )
}

function ProfileMenu({ isSystemAdmin }: { isSystemAdmin: boolean }) {
    const { user, signOut } = useAuth()
    const pathname = usePathname()
    const { firmSlug, groupSlug, canManage } = useShellData()

    const meta = (user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string }
    const name = resolveDisplayName(user?.user_metadata, user?.email) || "Account"
    const avatar = meta.avatar_url || meta.picture || null

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full min-w-0 items-center gap-2 rounded-control px-2 text-left text-ui text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                    {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium text-fg-muted">
                            {initialsOf(name)}
                        </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="truncate font-normal">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="gap-2">
                    <Link href="/d/u/profile"><UserCircle className="h-4 w-4 text-fg-muted" />Profile</Link>
                </DropdownMenuItem>
                {canManage && (
                    <DropdownMenuItem asChild className="gap-2">
                        <Link href={buildBillingPageHref({ firmSlug, groupSlug, pathname })}>
                            <CreditCard className="h-4 w-4 text-fg-muted" />Billing<AccessLock label="Firm admins only — hidden from other members" side="right" className="ml-auto" />
                        </Link>
                    </DropdownMenuItem>
                )}
                {/* The Support page lets firm admins in only (it redirects everyone else), so like
                    Billing it shows only for them, with the lock. */}
                {canManage && (
                    <DropdownMenuItem asChild className="gap-2">
                        <Link href={firmSlug ? `/d/support?firmSlug=${firmSlug}` : "/d/support"}>
                            <LifeBuoy className="h-4 w-4 text-fg-muted" />Support<AccessLock label="Firm admins only — hidden from other members" side="right" className="ml-auto" />
                        </Link>
                    </DropdownMenuItem>
                )}
                {isSystemAdmin && (
                    <DropdownMenuItem asChild className="gap-2">
                        <Link href="/system"><MonitorCheck className="h-4 w-4 text-fg-muted" />Sys Admin<AccessLock label="System admins only" side="right" className="ml-auto" /></Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {/* Public website pages: open in a new tab so the app stays where it was. */}
                <DropdownMenuItem asChild className="gap-2">
                    <a href="/resources/changelog" target="_blank" rel="noopener noreferrer">
                        <ScrollText className="h-4 w-4 text-fg-muted" />
                        <span className="flex-1">View changelog</span>
                        <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                    </a>
                </DropdownMenuItem>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                        <Info className="h-4 w-4 text-fg-muted" />
                        Learn more
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                        <DropdownMenuItem asChild className="gap-2">
                            <a href="/privacy" target="_blank" rel="noopener noreferrer">
                                <span className="flex-1">Privacy policy</span>
                                <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="gap-2">
                            <a href="/terms" target="_blank" rel="noopener noreferrer">
                                <span className="flex-1">Terms of service</span>
                                <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                            </a>
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-danger focus:text-danger" onSelect={() => void signOut()}>
                    <LogOut className="h-4 w-4" />Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const MAX_CLIENTS = 8

/**
 * Home and Inbox span every firm (.claude/plans/cross-firm-home-inbox.md), so they don't follow the
 * workspace switcher; the badge counts unread items across firms.
 */
function HomeAndInbox({ pathname, inboxCount }: { pathname: string; inboxCount: number }) {
    return (
        <>
            <SidebarItem href="/d/u/home" icon={<Home />} label="Home" active={pathname === "/d/u/home"} />
            <SidebarItem
                href="/d/u/inbox"
                icon={<Inbox />}
                label="Inbox"
                active={pathname.startsWith("/d/u/inbox")}
                trailing={inboxCount > 0 ? <CountBadge count={inboxCount} /> : undefined}
            />
        </>
    )
}

export function SidebarV2({
    isSystemAdmin = false,
    onCollapse,
    onNavigate,
}: {
    isSystemAdmin?: boolean
    /** Desktop collapse; omitted in the mobile drawer. */
    onCollapse?: () => void
    /** Called after a link is chosen — the mobile drawer closes itself with it. */
    onNavigate?: () => void
}) {
    const pathname = usePathname() ?? ""
    const searchParams = useSearchParams()
    const tab = searchParams?.get("tab") ?? null
    const { data, loading, firmSlug, groupSlug, canManage, firms, inboxTotal } = useShellData()

    const base = firmSlug && groupSlug ? firmPath(groupSlug, firmSlug) : null

    // The workspace pickers — /d (firm groups) and /d/{group}/f (firms) — sit above any firm, so the
    // firm-scoped navigation (engagements, Firm) would point at a firm the user has just stepped out
    // of. There the sidebar shows Home and Inbox (which span firms), the picker levels and a way back.
    const pickerMatch = pathname.match(/^\/d\/?$|^\/d\/([^/]+)\/f\/?$/)
    const aboveFirm = pickerMatch !== null
    const pickerGroupSlug = pickerMatch?.[1] ?? groupSlug
    const firmName = data?.firm.name ?? firms.find((f) => f.slug === firmSlug)?.name ?? null
    const isExternalOnly = data?.isExternalOnly ?? false

    // Clients with something live to work on, plus whichever client the current page is in.
    const visibleClients = useMemo(() => {
        const clients = data?.clients ?? []
        return clients
            .map((c) => {
                const open = c.engagements.filter((e) => e.status !== "COMPLETED")
                const containsActive = c.engagements.some((e) => pathname.startsWith(e.href))
                return { ...c, open, containsActive }
            })
            .filter((c) => c.open.length > 0 || c.containsActive)
    }, [data, pathname])
    const shownClients = visibleClients.slice(0, MAX_CLIENTS)

    return (
        <nav
            aria-label="Main"
            className="flex h-full w-full flex-col bg-surface-sidebar text-fg"
            onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) onNavigate?.()
            }}
        >
            {/* Workspace */}
            <div className="flex items-center gap-1 px-2 pb-1 pt-2">
                <WorkspaceSwitcher />
                {onCollapse && (
                    <Hint label={<>Collapse sidebar <Kbd>[</Kbd></>} side="bottom">
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                            aria-label="Collapse sidebar"
                        >
                            <WindowGlyph variant="left" />
                        </button>
                    </Hint>
                )}
            </div>

            {aboveFirm ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4 pt-1">
                    <div className="flex flex-col gap-px">
                        <HomeAndInbox pathname={pathname} inboxCount={inboxTotal} />
                    </div>
                    <SidebarSection id="workspaces" title="Workspaces">
                        <SidebarItem href="/d" icon={<LayoutGrid />} label="Firm groups" active={!pickerMatch?.[1]} />
                        {pickerGroupSlug && (
                            <SidebarItem href={groupFirmListPath(pickerGroupSlug)} icon={<Building2 />} label="Firms" active={Boolean(pickerMatch?.[1])} />
                        )}
                    </SidebarSection>
                    {base && (
                        <div className="flex flex-col gap-px">
                            <SidebarItem href={base} icon={<Home />} label={firmName ? `Back to ${firmName}` : "Back to your firm"} />
                        </div>
                    )}
                </div>
            ) : (<>
            {/* Primary */}
            <div className="flex flex-col gap-px px-2 pb-3">
                <SidebarItem
                    onClick={openCommandPalette}
                    icon={<Search />}
                    label="Search"
                    trailing={<Kbd className="hidden h-[18px] border-0 bg-transparent px-0 text-fg-subtle group-hover:inline-flex">⌘K</Kbd>}
                />
                <HomeAndInbox pathname={pathname} inboxCount={inboxTotal} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4">
                {/* Bookmarks live on Home, which keeps this sidebar to navigation. */}
                {/* Your engagements */}
                <SidebarSection
                    id="engagements"
                    title={isExternalOnly ? "Shared with you" : "Your engagements"}
                >
                    {loading && !data ? (
                        <div className="flex flex-col gap-2 px-2 py-1">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    ) : shownClients.length === 0 ? (
                        <p className="px-2 py-1 text-small text-fg-subtle">No active engagements yet.</p>
                    ) : (
                        shownClients.map((c) => (
                            <ClientGroup key={c.id} name={c.name} defaultOpen={c.containsActive || shownClients.length <= 4} storageId={`${firmSlug}_${c.id}`}>
                                {(c.open.length > 0 ? c.open : c.engagements.filter((e) => pathname.startsWith(e.href))).map((e) => {
                                    const status = statusOf("engagement", e.status)
                                    return (
                                        <SidebarItem
                                            key={e.id}
                                            href={e.href}
                                            className="pl-6"
                                            // The engagement's status icon (Linear-style), named for screen readers.
                                            icon={<StatusIcon stage={status.stage} label={status.label} />}
                                            label={e.name}
                                            title={`${e.name} · ${status.label}`}
                                            active={pathname.startsWith(e.href)}
                                        />
                                    )
                                })}
                            </ClientGroup>
                        ))
                    )}
                    {base && (
                        <SidebarItem
                            href={firmTabPath(groupSlug!, firmSlug!, "clients")}
                            icon={<ClientIcon />}
                            label={visibleClients.length > MAX_CLIENTS ? `All clients (${visibleClients.length})` : "All clients"}
                            active={tab === "clients" || (pathname.startsWith(`${base}/c`) && !pathname.includes("/e/"))}
                        />
                    )}
                </SidebarSection>

                {/* Firm */}
                {base && !isExternalOnly && (
                    <SidebarSection id="firm" title="Firm">
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "analytics")} icon={<BarChart3 />} label="Overview" active={tab === "analytics"} trailing={<AccessLock label="Firm admins only — hidden from other members" side="right" />} />}
                        <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "calendar")} icon={<CalendarDays />} label="Calendar" active={tab === "calendar"} />
                        <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "doc-search")} icon={<Search />} label="Doc Search" active={tab === "doc-search"} />
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "members")} icon={<Users />} label="Members" active={tab === "members"} trailing={<AccessLock label="Firm admins only — hidden from other members" side="right" />} />}
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "audit")} icon={<ClipboardList />} label="Audit" active={tab === "audit"} trailing={<AccessLock label="Firm admins only — hidden from other members" side="right" />} />}
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "settings")} icon={<Settings />} label="Settings" active={tab === "settings"} trailing={<AccessLock label="Firm admins only — hidden from other members" side="right" />} />}
                    </SidebarSection>
                )}
            </div>

            </>)}

            <div className="border-t border-line px-2 py-2">
                <ProfileMenu isSystemAdmin={isSystemAdmin} />
            </div>
        </nav>
    )
}

/** A client in the engagement tree, expandable to its engagements. Shared with the public demo. */
export function ClientGroup({ name, defaultOpen, storageId, children }: { name: string; defaultOpen: boolean; storageId: string; children: ReactNode }) {
    const key = `fm_v2_sidebar_client_${storageId}`
    const [open, setOpen] = useState(defaultOpen)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(key)
            if (saved === "open") setOpen(true)
            else if (saved === "closed" && !defaultOpen) setOpen(false)
        } catch {
            /* per-viewer convenience only */
        }
        // An engagement page inside this client always forces it open.
        if (defaultOpen) setOpen(true)
    }, [key, defaultOpen])
    function toggle() {
        setOpen((o) => {
            try {
                localStorage.setItem(key, o ? "closed" : "open")
            } catch {
                /* ignore */
            }
            return !o
        })
    }
    return (
        <div className="flex flex-col gap-px">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="group flex h-7 min-w-0 items-center gap-2 rounded-control px-2 text-left text-ui text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
                {/* Notion page tree: the client's icon, swapped for the expand chevron on hover. */}
                <span className="relative flex h-4 w-4 shrink-0 items-center justify-center text-fg-subtle">
                    <ClientIcon className="h-4 w-4 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0" />
                    <ChevronRight
                        className={cn(
                            "absolute h-3.5 w-3.5 opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100",
                            open && "rotate-90"
                        )}
                    />
                </span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
            </button>
            {open && children}
        </div>
    )
}
