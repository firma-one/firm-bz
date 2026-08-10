import Link from 'next/link'
import { Users } from 'lucide-react'
import { DemoClient } from '@/lib/demo/static-demo-data'

function clientStatusLabel(status: string | undefined): string {
    switch (status) {
        case 'PROSPECT': return 'Prospect'
        case 'ON_HOLD': return 'On hold'
        case 'PAST': return 'Past'
        case 'ACTIVE':
        default: return 'Active'
    }
}

function clientStatusBadgeClass(status: string | undefined): string {
    switch (status) {
        case 'PROSPECT': return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
        case 'ON_HOLD': return 'bg-amber-50 text-amber-500 ring-1 ring-amber-200'
        case 'PAST': return 'bg-zinc-50 text-zinc-400 ring-1 ring-zinc-200'
        case 'ACTIVE':
        default: return 'bg-primary/10 text-primary ring-1 ring-primary/25'
    }
}

/** Static counterpart to client-list.tsx (grid view only). */
export function DemoClientGrid({ clients }: { clients: DemoClient[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clients.map((client) => (
                <Link
                    key={client.slug}
                    href={`/demo/${client.slug}`}
                    className={`group relative bg-white rounded overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 flex flex-col h-48 ${client.status === 'PROSPECT' ? 'border border-dashed border-[#e5e7eb] hover:border-[#d1d5db]' : 'border border-[#e5e7eb] hover:border-[#d1d5db]'}`}
                >
                    <svg className="absolute bottom-0 right-0 pointer-events-none" width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="36,0 36,36 0,36" fill="hsl(var(--primary))" fillOpacity="0.12" />
                        <polygon points="36,16 36,36 16,36" fill="hsl(var(--primary))" />
                    </svg>
                    <div className="flex flex-col flex-1 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div
                                className="h-10 w-10 rounded flex items-center justify-center shrink-0 overflow-hidden border border-[#ebebed]"
                                style={{ backgroundColor: '#f3f4f6', color: '#45474c' }}
                            >
                                <Users className="h-5 w-5" />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`shrink-0 px-2 py-0.5 rounded-sm text-xs font-medium ${clientStatusBadgeClass(client.status)}`}>
                                    {clientStatusLabel(client.status)}
                                </span>
                            </div>
                        </div>

                        <h3 className="text-sm font-semibold text-slate-900 mb-auto line-clamp-1 group-hover:text-black transition-colors">
                            {client.name}
                        </h3>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <span>{client.industry ?? '—'}</span>
                            <span>{client.engagements.length} {client.engagements.length === 1 ? 'Engagement' : 'Engagements'}</span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    )
}
