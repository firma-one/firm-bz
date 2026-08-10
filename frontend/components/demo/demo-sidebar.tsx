'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
    AlarmClock,
    ArrowUpRight,
    BarChart3,
    Bookmark,
    Box,
    Briefcase,
    Building2,
    CalendarDays,
    ChevronDown,
    Clock,
    CornerDownRight,
    HelpCircle,
    History,
    LifeBuoy,
    Lock,
    Megaphone,
    Search,
    Settings,
    Users,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { DEMO_BOOKMARKS, DEMO_RECENTS, DEMO_REMINDERS } from '@/lib/demo/demo-topbar-data'

function relativeDueLabel(delta: number): string {
    if (delta >= 2) return `Due in ${delta} days`
    if (delta === 1) return 'Due tomorrow'
    if (delta === 0) return 'Due today'
    if (delta === -1) return '1 day overdue'
    return `${Math.abs(delta)} days overdue`
}

const spaceTitle = 'mb-2'

function SeparatorLine() {
    return <div className="-mx-3 border-b border-[#e5e7eb] my-8" aria-hidden />
}

function DeadSectionButton({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count?: number }) {
    return (
        <button
            type="button"
            disabled
            className={`d-sidebar-section flex items-center w-full px-3 ${spaceTitle} cursor-default opacity-70`}
        >
            <Icon className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
            <span className="flex-1 text-left">{label}</span>
            {count !== undefined && count > 0 && (
                <span className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none bg-primary">
                    {count}
                </span>
            )}
        </button>
    )
}

/**
 * Static counterpart to app-sidebar.tsx (inline variant) — full visual nav tree replicated,
 * but every link that would require auth/DB (firm switcher, recents, reminders, bookmarks,
 * view-as) is inert: shown with its real empty-state markup, not wired to data.
 */
export function DemoSidebar({ clientSlug }: { clientSlug?: string }) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isRecentsOpen, setIsRecentsOpen] = useState(false)
    const [isRemindersOpen, setIsRemindersOpen] = useState(false)
    const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
    const [isResourcesOpen, setIsResourcesOpen] = useState(false)

    const tabParam = searchParams.get('tab')
    const isOnFirmDashboard = pathname === '/demo'
    const isOverviewActive = isOnFirmDashboard && tabParam === 'analytics'
    const isClientsActive = isOnFirmDashboard && (tabParam === 'clients' || !tabParam)
    const isCalendarActive = isOnFirmDashboard && tabParam === 'calendar'
    const isDocSearchActive = isOnFirmDashboard && tabParam === 'doc-search'

    return (
        <div className="h-full w-full flex flex-col bg-white overflow-visible">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 space-y-4 pt-3 pb-3">
                    <nav className="space-y-1">
                        {/* FIRM SWITCHER — inert, single demo firm */}
                        <div className="w-full h-8 overflow-hidden" data-demo-tour="firm-switcher">
                            <div className="flex h-8 w-full items-center gap-2 rounded px-3 py-1 text-[#1b1b1d]">
                                <span className="shrink-0 flex items-center"><Building2 className="h-4 w-4 text-[#45474c]" /></span>
                                <span className="d-sidebar-section truncate flex-1 text-left">{DEMO_FIRM.name}</span>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="shrink-0 flex items-center" aria-label="Demo firm">
                                            <Box className="h-3.5 w-3.5 text-[#9ca3af]" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Demo firm — sample data</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>

                        {/* Tree sub-items: Overview + Clients + Calendar + Doc Search + Settings */}
                        <div className="ml-1 space-y-0.5">
                            <Link
                                href="/demo?tab=analytics"
                                className={`flex items-center transition-colors pl-2 pr-3 py-1.5 text-[0.8125rem] ${isOverviewActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                <BarChart3 className={`h-3.5 w-3.5 mr-2 shrink-0 ${isOverviewActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                <span>Overview</span>
                            </Link>
                            <Link
                                href="/demo"
                                className={`flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] ${isClientsActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                <Users className={`h-3.5 w-3.5 mr-2 shrink-0 ${isClientsActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                <span>Clients</span>
                            </Link>
                            <Link
                                href="/demo?tab=calendar"
                                className={`flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] ${isCalendarActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                <CalendarDays className={`h-3.5 w-3.5 mr-2 shrink-0 ${isCalendarActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                <span>Calendar</span>
                            </Link>
                            <Link
                                href="/demo?tab=doc-search"
                                className={`flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] ${isDocSearchActive ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : 'text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]'}`}
                            >
                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                <Search className={`h-3.5 w-3.5 mr-2 shrink-0 ${isDocSearchActive ? 'text-primary' : 'text-[#45474c]'}`} />
                                <span>Doc Search</span>
                            </Link>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="group/lock flex w-full items-center transition-colors pl-2 pr-3 py-1.5 text-[0.8125rem] text-[#45474c] font-medium opacity-50 cursor-not-allowed">
                                        <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                        <Settings className="h-3.5 w-3.5 mr-2 shrink-0 text-[#45474c]" />
                                        <span>Settings</span>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="right">Not available in this demo</TooltipContent>
                            </Tooltip>
                        </div>

                        {/* SUPPORT */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span data-demo-tour="sidebar-support" className="group/lock flex items-center d-sidebar-nav transition-colors py-2 px-3 text-[#45474c] font-medium opacity-50 cursor-not-allowed">
                                    <LifeBuoy className="h-4 w-4 shrink-0 mr-3" />
                                    <span className="flex-1">Support</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">Not available in this demo</TooltipContent>
                        </Tooltip>

                        <SeparatorLine />

                        {/* RECENTS — matches real accordion shell, fixed sample items */}
                        <div className="pt-1" data-demo-tour="sidebar-recent">
                            <button
                                type="button"
                                onClick={() => setIsRecentsOpen((v) => !v)}
                                className={`d-sidebar-section flex items-center w-full px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                            >
                                <History className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
                                <span className="flex-1 text-left">Recent</span>
                                <span className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none bg-primary">
                                    {DEMO_RECENTS.length}
                                </span>
                                <ChevronDown className={`h-3 w-3 text-[#9ca3af] transition-transform duration-200 ${isRecentsOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-out ${isRecentsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="space-y-1.5 pt-0.5">
                                        {DEMO_RECENTS.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className="flex items-center transition-colors pl-2 pr-3 py-1.5 text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                                            >
                                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                                {item.type === 'client' ? (
                                                    <Users className="h-3.5 w-3.5 shrink-0 text-[#45474c] mr-1.5" />
                                                ) : (
                                                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#45474c] mr-1.5" />
                                                )}
                                                <span className="flex-1 min-w-0 text-[0.8125rem] truncate">{item.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <SeparatorLine />

                        {/* REMINDERS — fixed sample items */}
                        <div className="pt-1" data-demo-tour="sidebar-reminders">
                            <button
                                type="button"
                                onClick={() => setIsRemindersOpen((v) => !v)}
                                className={`d-sidebar-section w-full flex items-center px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                            >
                                <AlarmClock className="h-3 w-3 mr-1.5 shrink-0" style={{ color: '#C4572B' }} />
                                <span className="flex-1 text-left">Reminders</span>
                                <span className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none" style={{ background: '#C4572B' }}>
                                    {DEMO_REMINDERS.length}
                                </span>
                                <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isRemindersOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-out ${isRemindersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-1 space-y-0.5 pt-0.5">
                                        {DEMO_REMINDERS.map((r) => (
                                            <div key={r.id} className="flex items-start gap-1 pl-2 pr-1 py-1.5">
                                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-0.5 mt-0.5" />
                                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3 shrink-0" style={{ color: r.delta <= 0 ? '#7A2414' : '#8B3A1C' }} />
                                                    <span className="text-[0.8125rem] font-medium text-[#45474c] truncate">{r.action}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <SeparatorLine />

                        {/* BOOKMARKS — fixed sample items */}
                        <div className="pt-1" data-demo-tour="sidebar-bookmarks">
                            <button
                                type="button"
                                onClick={() => setIsBookmarksOpen((v) => !v)}
                                className={`d-sidebar-section w-full flex items-center px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                            >
                                <Bookmark className="h-3 w-3 mr-1.5 shrink-0 text-[#45474c]" />
                                <span className="flex-1 text-left">Bookmarks</span>
                                <span className="mr-1.5 min-w-[14px] h-3.5 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none bg-primary">
                                    {DEMO_BOOKMARKS.length}
                                </span>
                                <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isBookmarksOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-out ${isBookmarksOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-1 space-y-0.5 pt-0.5">
                                        {DEMO_BOOKMARKS.map((b) => (
                                            <Link
                                                key={b.id}
                                                href={b.href}
                                                className="flex items-center gap-1 pl-2 pr-1 py-1.5 hover:bg-[#f9f9fb]"
                                            >
                                                <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-0.5" />
                                                <Bookmark className="h-3 w-3 shrink-0 text-[#45474c]" />
                                                <span className="flex-1 min-w-0 text-[0.8125rem] font-medium text-[#45474c] truncate ml-1.5">{b.label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <SeparatorLine />

                        {/* RESOURCES */}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsResourcesOpen((v) => !v)}
                                className={`d-sidebar-section w-full flex items-center px-3 ${spaceTitle} hover:opacity-80 transition-opacity`}
                            >
                                <HelpCircle className="h-3 w-3 shrink-0 mr-1.5 text-[#45474c]" />
                                <span className="flex-1 text-left">Resources</span>
                                <ChevronDown className={`h-3 w-3 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isResourcesOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`grid transition-all duration-200 ease-out ${isResourcesOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-1 space-y-0.5 pt-0.5">
                                        <Link
                                            href="/resources/faq"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] text-[#45474c] font-medium hover:bg-[#f9f9fb] hover:text-[#1b1b1d]"
                                        >
                                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                            <HelpCircle className="h-3.5 w-3.5 mr-2 shrink-0 text-[#45474c]" />
                                            <span className="flex-1">FAQs</span>
                                            <ArrowUpRight className="h-3 w-3 shrink-0 text-[#45474c]/40" />
                                        </Link>
                                        <span className="flex items-center w-full transition-colors pl-2 pr-2 py-1.5 text-[0.8125rem] text-[#45474c] font-medium opacity-50 cursor-not-allowed">
                                            <CornerDownRight className="h-3 w-3 shrink-0 text-[#d1d5db] mr-1.5" />
                                            <Megaphone className="h-3.5 w-3.5 mr-2 shrink-0 text-[#45474c]" />
                                            <span className="flex-1 text-left">What&apos;s New</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </nav>
                </div>
            </div>

            {/* Profile — pinned to bottom, inert */}
            <div className="border-t border-[#e5e7eb]/50 p-3" data-demo-tour="profile-menu">
                <div className="flex items-center gap-2.5 px-1 py-1.5 opacity-70">
                    <div className="h-8 w-8 rounded-full bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center text-[#45474c] text-xs font-semibold shrink-0">
                        DU
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[0.8125rem] font-medium text-[#1b1b1d] truncate">Demo User</div>
                        <div className="text-[0.6875rem] text-[#9ca3af] truncate">Preview mode</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
