'use client'

import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
    BarChart3,
    Briefcase,
    Building2,
    ChevronRight,
    ClipboardList,
    Folder,
    Home,
    LayoutGrid,
    MessagesSquare,
    PenTool,
    Settings,
    Upload,
    Users,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DemoClient, DemoEngagement, DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { getDeliverableStatusMap } from '@/lib/demo/demo-deliverables'
import { DemoFileList } from '@/components/demo/demo-file-list'
import { DemoDeadTab } from '@/components/demo/demo-dead-tab'
import { DemoEngagementOverview } from '@/components/demo/demo-engagement-overview'
import { DemoEngagementBoard } from '@/components/demo/demo-engagement-board'
import { DemoEngagementComments } from '@/components/demo/demo-engagement-comments'
import { DemoEngagementAudit } from '@/components/demo/demo-engagement-audit'
import { DemoEngagementMembers } from '@/components/demo/demo-engagement-members'

interface DemoEngagementWorkspaceProps {
    client: DemoClient
    engagement: DemoEngagement
}

const VALID_TABS = new Set(['analytics', 'files', 'board', 'comments', 'audit', 'members'])

/** Static counterpart to engagement-workspace.tsx. Overview/Files/Board/Comments/Audit/Members are real static pages driven by the selected engagement's actual data; Dossier/Settings stay inert. */
export function DemoEngagementWorkspace({ client, engagement }: DemoEngagementWorkspaceProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const tabParam = searchParams.get('tab') || 'analytics'
    const currentTab = VALID_TABS.has(tabParam) ? tabParam : 'analytics'

    const handleTabChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    const dueLabel = (() => {
        if (!engagement.dueDate) return null
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const due = new Date(engagement.dueDate); due.setHours(0, 0, 0, 0)
        const days = Math.round((due.getTime() - today.getTime()) / 86400000)
        const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`
        const color = days < 0 ? 'bg-red-50 text-red-700 border-red-200' : days <= 7 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-[#f0edee] text-[#45474c] border-[#e5e7eb]'
        return { label, color }
    })()

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Link href="/demo" className="flex items-center gap-1.5 hover:opacity-100">
                    <Building2 className="h-4 w-4 text-[#45474c] opacity-60" />
                    <span className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter transition-opacity">
                        {DEMO_FIRM.name}
                    </span>
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Link href={`/demo/${client.slug}`} className="flex items-center gap-1.5 hover:opacity-100">
                    <Users className="h-4 w-4 text-[#45474c] opacity-60" />
                    <span className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter transition-opacity">
                        {client.name}
                    </span>
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
                        {engagement.name}
                    </span>
                </span>
            </nav>

            {/* Project Identity Header — sits directly on pearl bg, no card wrapper */}
            <div className="flex items-start justify-between gap-6 mb-6" data-demo-tour="engagement-header">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                        <Briefcase className="h-10 w-10 text-[#1b1b1d]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d] truncate">
                                {engagement.name}
                            </h1>
                            <span className="bg-[#f0edee] text-[#45474c] border border-[#e5e7eb] px-2 py-0.5 rounded font-mono text-[10px] tracking-tight uppercase shrink-0">
                                Active
                            </span>
                            {dueLabel && (
                                <span className={`shrink-0 rounded font-mono text-[10px] border px-2 py-0.5 ${dueLabel.color}`}>{dueLabel.label}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-[#45474c]">Manage files, sharing and collaboration for this engagement.</p>
                            {engagement.contractType && (
                                <span className="shrink-0 bg-primary/10 text-primary border border-primary/20 rounded font-mono text-[10px] px-2 py-0.5">
                                    {engagement.contractType}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
                {/* Tab strip — full-width white with border-b, all Firm Admin/Engagement Lead tabs shown; Dossier/Settings stay inert */}
                <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 flex items-center h-14 overflow-hidden">
                    <div className="flex-1 min-w-0 relative h-full">
                        <div className="overflow-x-auto h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <div className="flex items-center h-full min-w-max">
                                <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                                    <TabsTrigger
                                        value="analytics"
                                        data-demo-tour="engagement-overview-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <BarChart3 className="w-4 h-4 mr-2" />
                                        Overview
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="files"
                                        data-demo-tour="engagement-files-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <Folder className="w-4 h-4 mr-2" />
                                        Files
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="board"
                                        data-demo-tour="engagement-board-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <LayoutGrid className="w-4 h-4 mr-2" />
                                        Board
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="comments"
                                        data-demo-tour="engagement-comments-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <MessagesSquare className="w-4 h-4 mr-2" />
                                        Comments
                                    </TabsTrigger>
                                    <DemoDeadTab icon={PenTool} label="Dossier" badgeText="Beta" />
                                    <TabsTrigger
                                        value="audit"
                                        data-demo-tour="engagement-audit-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <ClipboardList className="w-4 h-4 mr-2" />
                                        Audit
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="members"
                                        data-demo-tour="engagement-members-tab"
                                        className="relative h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                                    >
                                        <Users className="w-4 h-4 mr-2" />
                                        Members
                                    </TabsTrigger>
                                    <DemoDeadTab icon={Settings} label="Settings" />
                                </TabsList>
                            </div>
                        </div>
                    </div>
                    {currentTab === 'files' && (
                        <div className="shrink-0 px-3 border-l border-[#e5e7eb] flex items-center">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        disabled
                                        data-demo-tour="engagement-upload-btn"
                                        className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase opacity-60 cursor-not-allowed inline-flex items-center gap-1.5"
                                    >
                                        <Upload className="h-3.5 w-3.5" />
                                        New File / Folder
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <TabsContent value="analytics" className="m-0 h-full overflow-y-auto custom-scrollbar pt-1">
                        <DemoEngagementOverview engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="files" className="m-0 h-full flex flex-col min-h-0">
                        <DemoFileList folders={engagement.folders} deliverableStatusByFolderId={getDeliverableStatusMap(engagement)} />
                    </TabsContent>
                    <TabsContent value="board" className="m-0 h-full">
                        <DemoEngagementBoard engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="comments" className="m-0 h-full overflow-y-auto custom-scrollbar bg-white border border-[#e5e7eb] rounded">
                        <DemoEngagementComments engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="audit" className="m-0 h-full">
                        <DemoEngagementAudit engagement={engagement} />
                    </TabsContent>
                    <TabsContent value="members" className="m-0 h-full bg-white border border-[#e5e7eb] rounded overflow-hidden">
                        <DemoEngagementMembers />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
