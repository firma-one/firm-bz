"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
    BarChart3,
    Bookmark,
    CalendarDays,
    ChevronRight,
    CreditCard,
    FileText,
    FolderOpen,
    Home,
    Inbox,
    LifeBuoy,
    LogOut,
    MonitorCheck,
    PanelLeftClose,
    PanelsTopLeft,
    Search,
    Settings,
    UserCircle,
    Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useUiShell } from "@/lib/ui-shell-context"
import { setUiShell } from "@/lib/actions/user-ui-prefs"
import { buildBillingPageHref } from "@/lib/billing/build-billing-page-href"
import { firmPath, firmTabPath } from "@/lib/navigation/firm-paths"
import { ENGAGEMENT_STATUS, TAG_DOT_CLASSES, type EngagementStatusValue } from "@/lib/ui/status-colors"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useShellData } from "./shell-data-context"
import { WorkspaceSwitcher } from "./workspace-switcher"

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

function SidebarItem({
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
    if (href) {
        return (
            <Link href={href} className={classes} aria-current={active ? "page" : undefined} title={title}>
                {content}
            </Link>
        )
    }
    return (
        <button type="button" onClick={onClick} className={cn(classes, "w-full text-left")} title={title}>
            {content}
        </button>
    )
}

function SidebarSection({
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
    const uiShell = useUiShell()
    const [switchingUi, setSwitchingUi] = useState(false)

    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string }
    const name = meta.full_name || meta.name || user?.email?.split("@")[0] || "Account"
    const avatar = meta.avatar_url || meta.picture || null

    async function toggleUi() {
        setSwitchingUi(true)
        const { ok } = await setUiShell(uiShell === "v2" ? "v1" : "v2")
        if (ok) window.location.reload()
        else setSwitchingUi(false)
    }

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
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption text-fg-muted">
                            {name.charAt(0).toUpperCase()}
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
                            <CreditCard className="h-4 w-4 text-fg-muted" />Billing
                        </Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild className="gap-2">
                    <Link href={firmSlug ? `/d/support?firmSlug=${firmSlug}` : "/d/support"}>
                        <LifeBuoy className="h-4 w-4 text-fg-muted" />Support
                    </Link>
                </DropdownMenuItem>
                {isSystemAdmin && (
                    <DropdownMenuItem asChild className="gap-2">
                        <Link href="/system"><MonitorCheck className="h-4 w-4 text-fg-muted" />Sys Admin</Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2"
                    disabled={switchingUi}
                    onSelect={(e) => {
                        e.preventDefault()
                        void toggleUi()
                    }}
                >
                    <PanelsTopLeft className="h-4 w-4 text-fg-muted" />
                    <span className="flex-1">New UI</span>
                    <span
                        aria-hidden
                        className={cn(
                            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                            uiShell === "v2" ? "bg-action" : "bg-fg-subtle"
                        )}
                    >
                        <span className={cn("inline-block h-3 w-3 rounded-full bg-white transition-transform", uiShell === "v2" ? "translate-x-3.5" : "translate-x-0.5")} />
                    </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-danger focus:text-danger" onSelect={() => void signOut()}>
                    <LogOut className="h-4 w-4" />Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const MAX_CLIENTS = 8

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
    const { data, loading, firmSlug, groupSlug, canManage, firms, inboxCountFor } = useShellData()
    const currentFirmId = data?.firm.id ?? firms.find((f) => f.slug === firmSlug)?.id ?? null
    const inboxCount = inboxCountFor(currentFirmId)

    const base = firmSlug && groupSlug ? firmPath(groupSlug, firmSlug) : null
    const isFirmRoot = base !== null && pathname === base
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
                    <button
                        type="button"
                        onClick={onCollapse}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                        title="Collapse sidebar  ["
                        aria-label="Collapse sidebar"
                    >
                        <PanelLeftClose className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Primary */}
            <div className="flex flex-col gap-px px-2 pb-3">
                <SidebarItem
                    onClick={openCommandPalette}
                    icon={<Search />}
                    label="Search"
                    trailing={<Kbd className="hidden h-[18px] border-0 bg-transparent px-0 text-fg-subtle group-hover:inline-flex">⌘K</Kbd>}
                />
                {base && <SidebarItem href={base} icon={<Home />} label="Home" active={isFirmRoot && !tab} />}
                <SidebarItem
                    href={base ? `${base}/inbox` : "/d/u/notifications"}
                    icon={<Inbox />}
                    label="Inbox"
                    active={base ? pathname === `${base}/inbox` : pathname.startsWith("/d/u/notifications")}
                    trailing={inboxCount > 0 ? <CountBadge count={inboxCount} /> : undefined}
                />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4">
                {/* Favorites */}
                {data && data.favorites.length > 0 && (
                    <SidebarSection id="favorites" title="Favorites">
                        {data.favorites.map((f) => (
                            <SidebarItem
                                key={f.id}
                                href={f.href}
                                icon={f.kind === "document" ? <FileText /> : <Bookmark />}
                                label={f.label}
                                title={f.context ? `${f.label} · ${f.context}` : f.label}
                                active={f.kind === "project" && pathname.startsWith(f.href)}
                            />
                        ))}
                    </SidebarSection>
                )}

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
                                    const style = ENGAGEMENT_STATUS[e.status as EngagementStatusValue]
                                    return (
                                        <SidebarItem
                                            key={e.id}
                                            href={e.href}
                                            className="pl-7"
                                            icon={<span className={cn("h-1.5 w-1.5 rounded-full", TAG_DOT_CLASSES[style?.color ?? "gray"])} />}
                                            label={e.name}
                                            title={`${e.name} · ${style?.label ?? e.status}`}
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
                            icon={<FolderOpen />}
                            label={visibleClients.length > MAX_CLIENTS ? `All clients (${visibleClients.length})` : "All clients"}
                            active={tab === "clients" || (pathname.startsWith(`${base}/c`) && !pathname.includes("/e/"))}
                        />
                    )}
                </SidebarSection>

                {/* Firm */}
                {base && !isExternalOnly && (
                    <SidebarSection id="firm" title="Firm">
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "analytics")} icon={<BarChart3 />} label="Overview" active={tab === "analytics"} />}
                        <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "calendar")} icon={<CalendarDays />} label="Calendar" active={tab === "calendar"} />
                        <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "doc-search")} icon={<Search />} label="Doc Search" active={tab === "doc-search"} />
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "members")} icon={<Users />} label="Members" active={tab === "members"} />}
                        {canManage && <SidebarItem href={firmTabPath(groupSlug!, firmSlug!, "settings")} icon={<Settings />} label="Settings" active={tab === "settings"} />}
                    </SidebarSection>
                )}
            </div>

            <div className="border-t border-line px-2 py-2">
                <ProfileMenu isSystemAdmin={isSystemAdmin} />
            </div>
        </nav>
    )
}

function ClientGroup({ name, defaultOpen, storageId, children }: { name: string; defaultOpen: boolean; storageId: string; children: ReactNode }) {
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
                className="flex h-7 min-w-0 items-center gap-1.5 rounded-control px-2 text-left text-ui text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
            </button>
            {open && children}
        </div>
    )
}
