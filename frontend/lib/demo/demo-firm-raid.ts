import type { DemoFirm } from '@/lib/demo/static-demo-data'
import type { FirmRaidOverview, FirmRaidRow } from '@/lib/raid/raid-shared'

/**
 * The sample firm's open risks and issues, as the Firm Overview lists them (mock A): issues first, then
 * risks, newest first, each in one of the sample engagements, a row opening its RAID tab on /tour.
 */
export function demoFirmRaid(firm: DemoFirm, nowMs: number): FirmRaidOverview {
    const engagements = firm.clients.flatMap((c) => c.engagements.map((e) => ({ client: c, engagement: e })))
    if (engagements.length === 0) return { counts: { openIssues: 0, openRisks: 0, engagements: 0 }, rows: [], more: 0 }
    const at = (i: number) => engagements[i % engagements.length]
    const daysAgo = (n: number) => new Date(nowMs - n * 86_400_000).toISOString()
    const row = (id: string, type: FirmRaidRow['type'], title: string, owner: string | null, days: number, i: number): FirmRaidRow => ({
        id,
        type,
        title,
        ownerFirstName: owner,
        raisedAt: daysAgo(days),
        engagement: { name: at(i).engagement.name, clientName: at(i).client.name, href: `/tour/${at(i).client.slug}/${at(i).engagement.slug}?tab=raid` },
    })
    const rows = [
        row('tour-firm-raid-1', 'ISSUE', 'Paid media assets are past their due date', 'Alex', 2, 0),
        row('tour-firm-raid-2', 'ISSUE', 'The client hasn\u2019t approved the creative brief', 'Alex', 4, 1),
        row('tour-firm-raid-3', 'RISK', 'The signed change order may hold up the launch', null, 1, 0),
        row('tour-firm-raid-4', 'RISK', 'Pricing in section 4.2 may be out of date', 'Alex', 3, 2),
        row('tour-firm-raid-5', 'RISK', 'The board review the week after may move the timeline', 'Priya', 6, 3),
    ]
    return { counts: { openIssues: 3, openRisks: 4, engagements: Math.min(4, engagements.length) }, rows, more: 2 }
}
