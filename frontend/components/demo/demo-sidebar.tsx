'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
    BarChart3,
    Briefcase,
    CalendarDays,
    ChevronsUpDown,
    ClipboardList,
    CreditCard,
    ExternalLink,
    FolderOpen,
    Home,
    Inbox,
    Info,
    LifeBuoy,
    ScrollText,
    Search,
    Settings,
    UserCircle,
    UserPlus,
    Users,
} from 'lucide-react'
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
} from '@/components/ui/dropdown-menu'
import { AccessLock } from '@/components/ui/access-lock'
import { Hint } from '@/components/ui/tooltip'
import { ClientGroup, CountBadge, SidebarItem, SidebarSection } from '@/components/shell/sidebar-v2'
import { FirmMark } from '@/components/shell/workspace-switcher'
import { ENGAGEMENT_STATUS, TAG_DOT_CLASSES } from '@/lib/ui/status-colors'
import { cn } from '@/lib/utils'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'

const ADMIN_ONLY = 'Firm admins only — hidden from other members'
const NOT_IN_DEMO = 'Not available in this demo'

/** The firm view a demo URL shows: `?tab=` on /demo, All clients when there is none. */
export function demoFirmView(pathname: string, tab: string | null): string | null {
    if (pathname !== '/demo') return null
    return tab ?? 'clients'
}

/**
 * Static counterpart to SidebarV2 (components/shell/sidebar-v2.tsx), built from the same rows,
 * sections and client groups: workspace, Search, Home and Inbox, the engagement tree and the Firm
 * section, with the profile menu at the foot. Anything that needs an account is inert.
 *
 * Tour anchors sit on wrapping elements, so the shared rows need no demo-only props.
 */
export function DemoSidebar({ inboxCount }: { inboxCount: number }) {
    const pathname = usePathname() ?? ''
    const view = demoFirmView(pathname, useSearchParams()?.get('tab') ?? null)
    const active = ENGAGEMENT_STATUS.ACTIVE

    return (
        <nav aria-label="Main" className="flex h-full w-full flex-col bg-surface-sidebar text-fg">
            {/* Workspace — the one demo firm. */}
            <div className="flex items-center gap-1 px-2 pb-1 pt-2" data-demo-tour="firm-switcher">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-left text-ui font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                            aria-label="Switch workspace"
                        >
                            <FirmMark firm={{ name: DEMO_FIRM.name, logoUrl: null }} />
                            <span className="min-w-0 flex-1 truncate">{DEMO_FIRM.name}</span>
                            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>Demo workspace</DropdownMenuLabel>
                        <DropdownMenuItem className="gap-2">
                            <FirmMark firm={{ name: DEMO_FIRM.name, logoUrl: null }} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{DEMO_FIRM.name}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild className="gap-2 text-fg-muted">
                            <Link href="/signup" target="_blank" rel="noopener noreferrer">
                                <UserPlus className="h-4 w-4" />
                                Sign up to create your own firm
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Primary */}
            <div className="flex flex-col gap-px px-2 pb-3">
                <div data-demo-tour="command-palette">
                    {/* Hint needs a ref-taking child; the shared row is a plain function component. */}
                    <Hint label="Search is disabled in this demo" side="right">
                        <span className="block"><SidebarItem icon={<Search />} label="Search" onClick={() => {}} /></span>
                    </Hint>
                </div>
                <div data-demo-tour="sidebar-home">
                    <SidebarItem href="/demo/home" icon={<Home />} label="Home" active={pathname === '/demo/home'} />
                </div>
                <div data-demo-tour="sidebar-inbox">
                    <SidebarItem
                        href="/demo/inbox"
                        icon={<Inbox />}
                        label="Inbox"
                        active={pathname === '/demo/inbox'}
                        trailing={inboxCount > 0 ? <CountBadge count={inboxCount} /> : undefined}
                    />
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4">
                <SidebarSection id="demo_engagements" title="Your engagements">
                    {DEMO_FIRM.clients.map((client) => (
                        <ClientGroup
                            key={client.slug}
                            name={client.name}
                            storageId={`demo_${client.slug}`}
                            defaultOpen={true}
                        >
                            {client.engagements.map((e) => {
                                const href = `/demo/${client.slug}/${e.slug}`
                                return (
                                    <SidebarItem
                                        key={e.slug}
                                        href={href}
                                        className="pl-6"
                                        icon={
                                            <span className="relative flex text-fg-subtle group-hover:text-fg-muted">
                                                <Briefcase />
                                                <span
                                                    aria-hidden
                                                    className={cn('absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-surface-sidebar', TAG_DOT_CLASSES[active.color])}
                                                />
                                            </span>
                                        }
                                        label={e.name}
                                        active={pathname.startsWith(href)}
                                    />
                                )
                            })}
                        </ClientGroup>
                    ))}
                    <div data-demo-tour="firm-clients-tab">
                        <SidebarItem
                            href="/demo?tab=clients"
                            icon={<FolderOpen />}
                            label="All clients"
                            active={view === 'clients' || (pathname.startsWith('/demo/') && pathname.split('/').length === 3 && !['/demo/home', '/demo/inbox'].includes(pathname))}
                        />
                    </div>
                </SidebarSection>

                <SidebarSection id="demo_firm" title="Firm">
                    <div data-demo-tour="firm-overview-tab">
                        <SidebarItem href="/demo?tab=analytics" icon={<BarChart3 />} label="Overview" active={view === 'analytics'} trailing={<AccessLock label={ADMIN_ONLY} side="right" />} />
                    </div>
                    <div data-demo-tour="firm-calendar-tab">
                        <SidebarItem href="/demo?tab=calendar" icon={<CalendarDays />} label="Calendar" active={view === 'calendar'} />
                    </div>
                    <div data-demo-tour="firm-doc-search-tab">
                        <SidebarItem href="/demo?tab=doc-search" icon={<Search />} label="Doc Search" active={view === 'doc-search'} />
                    </div>
                    <div data-demo-tour="firm-members-tab">
                        <SidebarItem href="/demo?tab=members" icon={<Users />} label="Members" active={view === 'members'} trailing={<AccessLock label={ADMIN_ONLY} side="right" />} />
                    </div>
                    <div data-demo-tour="firm-audit-tab">
                        <SidebarItem href="/demo?tab=audit" icon={<ClipboardList />} label="Audit" active={view === 'audit'} trailing={<AccessLock label={ADMIN_ONLY} side="right" />} />
                    </div>
                    <Hint label={NOT_IN_DEMO} side="right">
                        <span className="block"><SidebarItem icon={<Settings />} label="Settings" onClick={() => {}} className="cursor-default opacity-60" trailing={<AccessLock label={ADMIN_ONLY} side="right" />} /></span>
                    </Hint>
                </SidebarSection>
            </div>

            <div className="border-t border-line px-2 py-2" data-demo-tour="profile-menu">
                <DemoProfileMenu />
            </div>
        </nav>
    )
}

/** Static counterpart to the sidebar's ProfileMenu: the same entries, inert where they need an account. */
function DemoProfileMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full min-w-0 items-center gap-2 rounded-control px-2 text-left text-ui text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium text-fg-muted">DU</span>
                    <span className="min-w-0 flex-1 truncate">Demo User</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="truncate font-normal">demo@firma.bz</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="gap-2"><UserCircle className="h-4 w-4 text-fg-muted" />Profile</DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2">
                    <CreditCard className="h-4 w-4 text-fg-muted" />Billing<AccessLock label={ADMIN_ONLY} side="right" className="ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2">
                    <LifeBuoy className="h-4 w-4 text-fg-muted" />Support<AccessLock label={ADMIN_ONLY} side="right" className="ml-auto" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
                <DropdownMenuItem asChild className="gap-2">
                    <Link href="/signup" target="_blank" rel="noopener noreferrer">
                        <UserPlus className="h-4 w-4 text-fg-muted" />Sign up
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
