import { Users, Briefcase, MailOpen, TrendingUp } from 'lucide-react'
import { StatTile } from '@/components/ui/stat-tile'
import { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoFirmActionCenter } from '@/components/demo/demo-firm-action-center'
import { DemoPipelineBar } from '@/components/demo/demo-pipeline-bar'

function formatValue(val: number): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
    return `$${val.toFixed(0)}`
}

/** Static counterpart to firm-business-insights.tsx — stats computed directly from DEMO_FIRM, no fetching. */
export function DemoFirmOverview({ firm }: { firm: DemoFirm }) {
    const activeClients = firm.clients.filter((c) => c.status === 'ACTIVE').length
    const prospects = firm.clients.filter((c) => c.status === 'PROSPECT').length
    const totalEngagements = firm.clients.reduce((sum, c) => sum + c.engagements.length, 0)

    const contractTypeCounts = new Map<string, number>()
    firm.clients.forEach((c) => c.engagements.forEach((e) => {
        if (!e.contractType) return
        contractTypeCounts.set(e.contractType, (contractTypeCounts.get(e.contractType) ?? 0) + 1)
    }))

    const pipelineTotal = firm.clients.reduce(
        (sum, c) => sum + c.engagements.reduce((s, e) => s + (Number(e.rateOrValue ?? 0) || 0), 0),
        0
    )

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', paddingBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                <div className="bg-white border border-[#e5e7eb] rounded p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Business Overview</h2>
                            <p className="text-sm text-gray-500 mt-0.5">Client pipeline and active engagements</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                        <StatTile icon={Users} label="Active Client(s)" count={activeClients} colorClass="bg-blue-50 text-blue-600" />
                        <StatTile icon={TrendingUp} label="Prospective Client(s)" count={prospects} colorClass="bg-indigo-50 text-indigo-600" />
                        <StatTile icon={Briefcase} label="Active Engagement(s)" count={totalEngagements} colorClass="bg-purple-50 text-purple-600" />
                        <StatTile icon={MailOpen} label="Pending Invitation(s)" count={0} colorClass="bg-amber-50 text-amber-600" />
                    </div>

                    <div>
                        <div className="flex items-baseline justify-between mt-5 mb-3">
                            <h3 className="text-sm font-semibold text-gray-500">Revenue Pipeline</h3>
                            <span className="text-lg font-bold text-gray-900">{formatValue(pipelineTotal)}</span>
                        </div>
                        <div className="bg-white rounded p-4 border border-[#e5e7eb] shadow-md">
                            <DemoPipelineBar clients={firm.clients} />
                        </div>
                    </div>

                    {contractTypeCounts.size > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 mb-3 mt-5">Engagement Types</h3>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(contractTypeCounts.entries()).map(([type, count]) => (
                                    <div key={type} className="flex items-center gap-2 px-3 py-1.5 bg-[#f3f4f6] border border-gray-100 rounded shadow-md">
                                        <span className="text-sm font-semibold text-gray-900">{count}</span>
                                        <span className="text-xs text-gray-500">{type}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <DemoFirmActionCenter firm={firm} />
        </div>
    )
}
