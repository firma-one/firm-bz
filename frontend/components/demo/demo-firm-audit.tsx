import { Briefcase, Share2, UserPlus } from 'lucide-react'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { DemoFirm } from '@/lib/demo/static-demo-data'

type AuditRowBase = {
    id: string
    eventScope: string
    eventAction: string
    details: string
    actorName: string
    icon: React.ReactNode
}

type AuditRow = AuditRowBase & { offsetDays: number }

const ACTORS = ['Alex Jordan', 'Sam Rivera', 'Jordan Lee', 'Taylor Kim']

/** Firm's audit history starts this many days ago — everything else is spaced forward from there toward "now", so the log always reads as recent regardless of when the page is viewed. */
const HISTORY_START_DAYS_AGO = 60

function buildAuditRows(firm: DemoFirm): AuditRow[] {
    const rows: AuditRowBase[] = []
    let id = 0

    firm.clients.forEach((client, ci) => {
        rows.push({
            id: `r${++id}`,
            eventScope: 'Client',
            eventAction: 'Created',
            details: client.name,
            actorName: ACTORS[ci % ACTORS.length],
            icon: <UserPlus className="h-4 w-4 text-blue-400" />,
        })
        client.engagements.forEach((engagement, ei) => {
            rows.push({
                id: `r${++id}`,
                eventScope: 'Engagement',
                eventAction: 'Created',
                details: engagement.name,
                actorName: ACTORS[(ci + ei) % ACTORS.length],
                icon: <Briefcase className="h-4 w-4 text-blue-600" />,
            })
            const firstFile = engagement.folders[0]?.files[0]?.name
            if (firstFile) {
                rows.push({
                    id: `r${++id}`,
                    eventScope: 'File',
                    eventAction: 'Shared',
                    details: firstFile,
                    actorName: ACTORS[(ci + ei + 1) % ACTORS.length],
                    icon: <Share2 className="h-4 w-4 text-purple-600" />,
                })
            }
        })
    })

    // Spread rows evenly from HISTORY_START_DAYS_AGO down to ~1 day ago, oldest first in
    // creation order above — so the timeline always reads newest-activity-near-today.
    const step = HISTORY_START_DAYS_AGO / rows.length
    return rows.map((row, i) => ({
        ...row,
        offsetDays: Math.max(Math.round(HISTORY_START_DAYS_AGO - i * step), 1),
    }))
}

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
}

/** Static counterpart to firm-scoped EngagementAuditPane / AuditWithFilters, modeled on SandboxAuditPreview's pattern — aggregated across all demo clients/engagements. */
export function DemoFirmAudit({ firm }: { firm: DemoFirm }) {
    const rows = buildAuditRows(firm).sort((a, b) => a.offsetDays - b.offsetDays)
    const now = Date.now()

    return (
        <div className="flex flex-col h-full min-h-0 bg-white border border-[#e5e7eb] rounded p-4">
            <p className="text-xs text-gray-400 mb-3">Audit history is permanent and cannot be edited.</p>

            <div className="flex flex-wrap items-end gap-2 mb-4 opacity-40">
                {['From date', 'To date', 'Event scope', 'Event type', 'Actor'].map((label) => (
                    <div key={label} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-600">{label}</label>
                        <div className="rounded border border-slate-300/80 px-2 py-1.5 text-xs w-[130px] bg-white flex items-center justify-between gap-2 text-gray-400">
                            <span>All</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-xs text-gray-500 mb-2">
                Showing <span className="font-medium text-gray-700">{rows.length}</span> rows
            </div>

            <div className="flex-1 overflow-auto min-h-0 bg-white border border-[#e5e7eb] rounded">
                <table className="w-full text-sm">
                    <thead className="bg-white border-b border-[#e5e7eb] sticky top-0">
                        <tr>
                            {['Date', 'Event scope', 'Event type', 'Details', 'Actor'].map((col) => (
                                <th key={col} className="text-left py-2.5 px-3 text-[0.8125rem] font-medium text-[#45474c]">{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5e7eb]">
                        {rows.map((row) => {
                            const ts = new Date(now - row.offsetDays * 86400000).toISOString()
                            return (
                                <tr key={row.id} className="hover:bg-[#f9f9fb]">
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                        <RelativeDateTime date={ts} displayFormat="short" textClassName="text-[#45474c] text-[0.8125rem]" />
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-2">
                                            {row.icon}
                                            <span className="text-[#45474c] text-[0.8125rem]">{row.eventScope}</span>
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="font-medium text-[#1b1b1d] text-[0.8125rem]">{row.eventAction}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-[0.8125rem] text-gray-700 max-w-[220px] truncate">{row.details}</td>
                                    <td className="py-2.5 px-3 text-[0.8125rem]">
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="text-[9px] font-bold text-primary">{initials(row.actorName)}</span>
                                            </div>
                                            <span className="text-[#45474c] truncate max-w-[140px]">{row.actorName}</span>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
