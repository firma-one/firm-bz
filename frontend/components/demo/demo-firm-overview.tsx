'use client'

import { useEffect, useState } from 'react'
import { Briefcase, CheckCircle2, LineChart, MailOpen, Send, TrendingUp, UserPlus, Users } from 'lucide-react'
import { InsightCard } from '@/components/dashboard/insight-card'
import { PipelineBar, SubSection } from '@/components/dashboard/firm-business-insights'
import { StatTile } from '@/components/ui/stat-tile'
import type { ClientPipelineItem } from '@/app/api/firms/[firmId]/insights/route'
import type { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoFirmBrief } from '@/components/demo/demo-firm-brief'
import { DemoFirmActionCenter } from '@/components/demo/demo-firm-action-center'

function formatValue(val: number): string {
    if (val === 0) return '—'
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
    return `$${val.toFixed(0)}`
}

const value = (raw?: string) => Number(raw ?? 0) || 0

/** Days until an ISO date, from the visitor's today. */
function daysUntil(iso: string, today: Date): number {
    const d = new Date(iso)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / 86400000)
}

/**
 * Static counterpart to the firm Overview (firm-clients-view.tsx → FirmBusinessInsights +
 * FirmActionCenter): the same flat sections and the same pipeline bar, computed from the sample
 * firm. "Closing soon" depends on today, so it is worked out after mount.
 */
export function DemoFirmOverview({ firm }: { firm: DemoFirm }) {
    const [today, setToday] = useState<Date | null>(null)
    useEffect(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        setToday(d)
    }, [])

    const activeClients = firm.clients.filter((c) => c.status === 'ACTIVE').length
    const prospects = firm.clients.filter((c) => c.status === 'PROSPECT').length
    const engagements = firm.clients.flatMap((c) => c.engagements)
    const closingSoon = (due?: string) => Boolean(today && due && daysUntil(due, today) <= 30)

    const pipeline: ClientPipelineItem[] = firm.clients.map((c) => ({
        clientId: c.slug,
        clientName: c.name,
        clientSlug: c.slug,
        value: c.engagements.reduce((s, e) => s + value(e.rateOrValue), 0),
        closingSoonValue: c.engagements.filter((e) => closingSoon(e.dueDate)).reduce((s, e) => s + value(e.rateOrValue), 0),
        engagementCount: c.engagements.length,
        engagements: c.engagements.map((e) => ({
            engagementId: e.slug,
            engagementName: e.name,
            engagementSlug: e.slug,
            value: value(e.rateOrValue),
            closingSoon: closingSoon(e.dueDate),
            status: 'ACTIVE',
            contractType: e.contractType ?? null,
        })),
    }))
    const pipelineTotal = pipeline.reduce((s, p) => s + p.value, 0)
    const closingCount = engagements.filter((e) => closingSoon(e.dueDate)).length
    const closingValue = pipeline.reduce((s, p) => s + p.closingSoonValue, 0)

    const contractTypes = new Map<string, number>()
    for (const e of engagements) {
        const type = e.contractType ?? 'Unspecified'
        contractTypes.set(type, (contractTypes.get(type) ?? 0) + 1)
    }

    return (
        <div className="grid grid-cols-1 gap-8 pb-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-10">
                <DemoFirmBrief firm={firm} />

                <InsightCard title="Business overview" icon={LineChart} theme="blue" subtext="Client pipeline and active engagements">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4 md:grid-cols-4">
                        <StatTile icon={Users} label="Active clients" count={activeClients} colorClass="text-fg-subtle" />
                        <StatTile icon={TrendingUp} label="Prospects" count={prospects} colorClass="text-fg-subtle" />
                        <StatTile icon={Briefcase} label="Active engagements" count={engagements.length} colorClass="text-fg-subtle" />
                        <StatTile icon={MailOpen} label="Pending invitations" count={2} colorClass="text-fg-subtle" />
                    </div>

                    <SubSection
                        title="Revenue pipeline"
                        trailing={
                            <div className="flex items-baseline gap-3 text-small">
                                {closingCount > 0 && (
                                    <span className="text-tag-orange-fg">
                                        {closingCount} closing within 30 days · {formatValue(closingValue)}
                                    </span>
                                )}
                                <span className="text-ui font-medium tabular-nums text-fg">{formatValue(pipelineTotal)}</span>
                            </div>
                        }
                    >
                        <PipelineBar items={pipeline} total={pipelineTotal} symbol="$" />
                    </SubSection>

                    <SubSection title="Engagement types">
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-small">
                            {Array.from(contractTypes.entries()).map(([type, count]) => (
                                <span key={type} className="inline-flex items-baseline gap-1.5">
                                    <span className="text-fg-muted">{type}</span>
                                    <span className="font-medium tabular-nums text-fg">{count}</span>
                                </span>
                            ))}
                        </div>
                    </SubSection>

                    <SubSection title="This week">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <StatTile icon={UserPlus} label="New clients" count={0} colorClass="text-fg-subtle" />
                            <StatTile icon={Briefcase} label="New engagements" count={1} colorClass="text-fg-subtle" />
                            <StatTile icon={Send} label="Invitations sent" count={2} colorClass="text-fg-subtle" />
                            <StatTile icon={CheckCircle2} label="Engagements closed" count={0} colorClass="text-fg-subtle" />
                        </div>
                    </SubSection>
                </InsightCard>
            </div>

            <DemoFirmActionCenter firm={firm} />
        </div>
    )
}
