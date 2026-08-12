'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { BarChart3, Building2, CalendarDays, ChevronRight, ClipboardList, Home, Search, Settings, UserCog, UserPlus, Users } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoClientGrid } from '@/components/demo/demo-client-grid'
import { DemoDeadTab } from '@/components/demo/demo-dead-tab'
import { DemoFirmOverview } from '@/components/demo/demo-firm-overview'
import { DemoFirmDocSearch } from '@/components/demo/demo-firm-doc-search'
import { DemoFirmMembers } from '@/components/demo/demo-firm-members'
import { DemoFirmAudit } from '@/components/demo/demo-firm-audit'
import { DemoCalendarView } from '@/components/demo/demo-calendar-view'

interface DemoFirmDashboardProps {
    firm: DemoFirm
}

const VALID_TABS = new Set(['analytics', 'clients', 'calendar', 'doc-search', 'members', 'audit'])

/** Static counterpart to firm-clients-view.tsx. Overview/Clients/Calendar/Doc Search/Members/Audit are real static pages; Settings stays inert. */
export function DemoFirmDashboard({ firm }: DemoFirmDashboardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const tabParam = searchParams.get('tab') || 'clients'
    const currentTab = VALID_TABS.has(tabParam) ? tabParam : 'clients'

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    return (
        <div className="flex flex-col h-full">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">{firm.name}</span>
            </nav>

            {/* Firm Identity Header — architectural style, sits directly on pearl bg */}
            <div className="flex items-start justify-between gap-6 mb-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0 overflow-hidden">
                        <Building2 className="h-10 w-10 text-[#1b1b1d]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                                {firm.name}
                            </h1>
                        </div>
                        <p className="text-sm text-[#45474c] mt-1">Manage organization-wide client records and operational parameters for this firm.</p>
                    </div>
                </div>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                {/* Tab navigation — full-width white strip with border-b, all Firm Admin/Engagement Lead tabs shown; Calendar/Settings render inert */}
                <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0 flex items-center h-14 overflow-hidden">
                    <div className="flex-1 min-w-0 h-full pr-4">
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            <TabsTrigger
                                value="analytics"
                                data-demo-tour="firm-overview-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="clients"
                                data-demo-tour="firm-clients-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <Users className="w-4 h-4 mr-2" />
                                Clients
                                {firm.clients.length > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {firm.clients.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                value="calendar"
                                data-demo-tour="firm-calendar-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <CalendarDays className="w-4 h-4 mr-2" />
                                Calendar
                            </TabsTrigger>
                            <TabsTrigger
                                value="doc-search"
                                data-demo-tour="firm-doc-search-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Doc Search
                            </TabsTrigger>
                            <TabsTrigger
                                value="members"
                                data-demo-tour="firm-members-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <UserCog className="w-4 h-4 mr-2" />
                                Members
                            </TabsTrigger>
                            <TabsTrigger
                                value="audit"
                                data-demo-tour="firm-audit-tab"
                                className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <ClipboardList className="w-4 h-4 mr-2" />
                                Audit
                            </TabsTrigger>
                            <DemoDeadTab icon={Settings} label="Settings" />
                        </TabsList>
                    </div>
                    {currentTab === 'clients' && (
                        <div className="shrink-0 px-3 border-l border-[#e5e7eb] flex items-center">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        disabled
                                        data-demo-tour="firm-add-client-btn"
                                        className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase opacity-60 cursor-not-allowed inline-flex items-center gap-1.5"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        Add Client
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <TabsContent value="analytics" className="m-0 h-full">
                        <div className="py-2">
                            <DemoFirmOverview firm={firm} />
                        </div>
                    </TabsContent>
                    <TabsContent value="clients" className="m-0 h-full">
                        <div className="py-2">
                            <DemoClientGrid clients={firm.clients} />
                        </div>
                    </TabsContent>
                    <TabsContent value="calendar" className="m-0 h-full">
                        <div className="py-2">
                            <DemoCalendarView firm={firm} />
                        </div>
                    </TabsContent>
                    <TabsContent value="doc-search" className="m-0 h-full">
                        <DemoFirmDocSearch firm={firm} />
                    </TabsContent>
                    <TabsContent value="members" className="m-0 h-full">
                        <div className="py-2">
                            <DemoFirmMembers />
                        </div>
                    </TabsContent>
                    <TabsContent value="audit" className="m-0 h-full">
                        <div className="py-2 h-full">
                            <DemoFirmAudit firm={firm} />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
