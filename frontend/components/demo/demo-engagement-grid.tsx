import Link from 'next/link'
import { Briefcase } from 'lucide-react'
import { DemoClient, DemoEngagement, countFilesInEngagement } from '@/lib/demo/static-demo-data'

function engagementStatusBadgeClass(): string {
    // All demo engagements render as ACTIVE — matches engagement-list.tsx's ACTIVE branch styling.
    return 'bg-primary/10 text-primary ring-1 ring-primary/25'
}

/** Static counterpart to engagement-list.tsx (grid view only). */
export function DemoEngagementGrid({ client, engagements }: { client: DemoClient; engagements: DemoEngagement[] }) {
    const isProspect = client.status === 'PROSPECT'
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {engagements.map((engagement) => (
                <Link
                    key={engagement.slug}
                    href={`/demo/${client.slug}/${engagement.slug}`}
                    className={`group relative bg-white rounded p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col h-48 ${isProspect ? 'border border-dashed border-amber-300 hover:border-amber-400' : 'border border-[#e5e7eb] hover:border-primary/50'}`}
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 bg-[#f3f4f6] text-[#45474c] rounded flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all shrink-0">
                            <Briefcase className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`shrink-0 px-2 py-0.5 rounded-sm text-xs font-medium ${engagementStatusBadgeClass()}`}>
                                Active
                            </span>
                        </div>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 mb-1 line-clamp-1 group-hover:text-black transition-colors">
                        {engagement.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-auto">
                        {engagement.contractType ?? 'No description provided.'}
                    </p>

                    <div className="mt-auto pt-3 border-t border-[#e5e7eb] flex items-center justify-between text-[11px] text-slate-400">
                        <span>{engagement.dueDate ? `Due ${engagement.dueDate}` : '—'}</span>
                        <span>{countFilesInEngagement(engagement)} files</span>
                    </div>
                </Link>
            ))}
        </div>
    )
}
