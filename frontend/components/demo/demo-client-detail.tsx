import Link from 'next/link'
import { Briefcase, Building2, ChevronRight, Contact, Home, Settings, SquarePlus, Users } from 'lucide-react'
import { DemoClient, DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { DemoEngagementGrid } from '@/components/demo/demo-engagement-grid'
import { DemoDeadTab } from '@/components/demo/demo-dead-tab'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface DemoClientDetailProps {
    client: DemoClient
}

/** Static counterpart to client-project-view.tsx. Full tab strip visible to Firm Admin/Engagement Lead is replicated; only Engagements is navigable, the rest render inert. */
export function DemoClientDetail({ client }: DemoClientDetailProps) {
    return (
        <TooltipProvider>
        <div className="flex flex-col h-full">
            {/* Breadcrumbs — monospace architectural style */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-[#45474c] opacity-60" />
                <Link
                    href="/demo"
                    className="font-mono text-[11px] text-[#45474c] opacity-60 uppercase tracking-tighter hover:opacity-100 transition-opacity"
                >
                    {DEMO_FIRM.name}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Users className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">
                    {client.name}
                </span>
            </nav>

            {/* Client Identity Header — sits directly on pearl bg */}
            <div className="flex items-start justify-between gap-6 mb-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0 overflow-hidden">
                        <Users className="h-10 w-10 text-[#1b1b1d]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                                {client.name}
                            </h1>
                            {client.status && (
                                <span className={`px-2 py-0.5 rounded font-mono text-[10px] tracking-tight uppercase shrink-0 border ${
                                    client.status === 'ACTIVE' ? 'bg-[#f0edee] text-[#45474c] border-[#e5e7eb]' :
                                    client.status === 'PROSPECT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    client.status === 'ON_HOLD' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    client.status === 'PAST' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                    'bg-[#f0edee] text-[#45474c] border-[#e5e7eb]'
                                }`}>
                                    {client.status === 'ON_HOLD' ? 'On Hold' : client.status.charAt(0) + client.status.slice(1).toLowerCase()}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-sm text-[#45474c]">Manage engagements and client settings.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab strip — full-width white with border-b, all Firm Admin/Engagement Lead tabs shown; only Engagements is navigable */}
            <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0 flex items-center h-14 overflow-hidden">
                <div className="flex-1 min-w-0 h-full pr-4">
                    <div className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                        <div data-demo-tour="client-engagements-tab" className="relative h-full px-4 rounded-none font-medium text-sm border-b-2 border-brand-accent text-[#1b1b1d] font-bold bg-transparent inline-flex items-center">
                            <Briefcase className="w-4 h-4 mr-2" />
                            Engagements
                            {client.engagements.length > 0 && (
                                <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                    {client.engagements.length}
                                </span>
                            )}
                        </div>
                        <DemoDeadTab icon={Contact} label="Contacts" />
                        <DemoDeadTab icon={Settings} label="Settings" />
                    </div>
                </div>
                <div className="shrink-0 px-3 border-l border-[#e5e7eb] flex items-center">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                disabled
                                data-demo-tour="engagement-add-btn"
                                className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase opacity-60 cursor-not-allowed inline-flex items-center gap-1.5"
                            >
                                <SquarePlus className="h-3.5 w-3.5" />
                                Add Engagement
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="py-1">
                    <DemoEngagementGrid client={client} engagements={client.engagements} />
                </div>
            </div>
        </div>
        </TooltipProvider>
    )
}
