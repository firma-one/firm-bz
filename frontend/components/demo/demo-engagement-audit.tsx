import { Briefcase, MessageSquare, Share2 } from 'lucide-react'
import { DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoAuditLog, type DemoAuditRow } from '@/components/demo/demo-audit-log'

type AuditRow = DemoAuditRow

const ACTORS = ['Alex Jordan', 'Sam Rivera', 'Jordan Lee', 'Taylor Kim']
const HISTORY_START_DAYS_AGO = 30

function buildAuditRows(engagement: DemoEngagement): AuditRow[] {
    const rows: Omit<AuditRow, 'offsetDays'>[] = []
    let id = 0

    rows.push({
        id: `r${++id}`,
        eventScope: 'Engagement',
        eventAction: 'Created',
        details: engagement.name,
        actorName: ACTORS[0],
        icon: Briefcase,
    })

    const allFiles = engagement.folders.flatMap((f) => f.files)
    allFiles.slice(0, 6).forEach((file, i) => {
        rows.push({
            id: `r${++id}`,
            eventScope: 'File',
            eventAction: 'Shared',
            details: file.name,
            actorName: ACTORS[(i + 1) % ACTORS.length],
            icon: Share2,
        })
        if (i % 2 === 0) {
            rows.push({
                id: `r${++id}`,
                eventScope: 'File',
                eventAction: 'Commented',
                details: file.name,
                actorName: ACTORS[(i + 2) % ACTORS.length],
                icon: MessageSquare,
            })
        }
    })

    const step = HISTORY_START_DAYS_AGO / rows.length
    return rows.map((row, i) => ({ ...row, offsetDays: Math.max(Math.round(HISTORY_START_DAYS_AGO - i * step), 1) }))
}

/** Static counterpart to AuditWithFilters (engagement mode) — history derived from the selected engagement's real files. */
export function DemoEngagementAudit({ engagement }: { engagement: DemoEngagement }) {
    return <DemoAuditLog rows={buildAuditRows(engagement)} showScope={false} />
}
