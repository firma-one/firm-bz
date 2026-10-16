import { Briefcase, Share2, Users } from 'lucide-react'
import { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoAuditLog, type DemoAuditRow } from '@/components/demo/demo-audit-log'

type AuditRowBase = Omit<DemoAuditRow, 'offsetDays'>
type AuditRow = DemoAuditRow

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
            icon: Users,
        })
        client.engagements.forEach((engagement, ei) => {
            rows.push({
                id: `r${++id}`,
                eventScope: 'Engagement',
                eventAction: 'Created',
                details: engagement.name,
                actorName: ACTORS[(ci + ei) % ACTORS.length],
                icon: Briefcase,
            })
            const firstFile = engagement.folders[0]?.files[0]?.name
            if (firstFile) {
                rows.push({
                    id: `r${++id}`,
                    eventScope: 'File',
                    eventAction: 'Shared',
                    details: firstFile,
                    actorName: ACTORS[(ci + ei + 1) % ACTORS.length],
                    icon: Share2,
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

/** Static counterpart to the firm's AuditWithFilters — aggregated across all demo clients and engagements. */
export function DemoFirmAudit({ firm }: { firm: DemoFirm }) {
    return <DemoAuditLog rows={buildAuditRows(firm)} />
}
