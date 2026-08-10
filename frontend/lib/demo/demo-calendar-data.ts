import { DemoFirm } from '@/lib/demo/static-demo-data'

export type DemoCalendarEventType = 'kickoff' | 'due' | 'deliverable' | 'document'

export interface DemoCalendarEngagement {
    id: string
    name: string
    slug: string
    clientId: string
    clientName: string
    clientSlug: string
    status: string
}

export interface DemoCalendarEvent {
    id: string
    engagementId: string
    type: DemoCalendarEventType
    title: string
    date: string
    clientName: string
    engagementName: string
}

export interface DemoCalendarData {
    engagements: DemoCalendarEngagement[]
    events: DemoCalendarEvent[]
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10)
}

/** Places dummy events across the previous, current, and next calendar month so the demo always looks freshly active regardless of when it's viewed. */
export function buildDemoCalendarData(firm: DemoFirm): DemoCalendarData {
    const engagements: DemoCalendarEngagement[] = []
    const events: DemoCalendarEvent[] = []

    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    let engagementIndex = 0
    let eventIndex = 0

    firm.clients.forEach((client) => {
        client.engagements.forEach((engagement) => {
            const engagementId = `demo-cal-eng-${engagementIndex}`
            engagements.push({
                id: engagementId,
                name: engagement.name,
                slug: engagement.slug,
                clientId: client.slug,
                clientName: client.name,
                clientSlug: client.slug,
                status: 'ACTIVE',
            })

            // Kickoff — previous month, day derived from index so events spread across the month.
            const kickoffDay = 3 + (engagementIndex % 20)
            events.push({
                id: `demo-cal-evt-${eventIndex++}`,
                engagementId,
                type: 'kickoff',
                title: `${engagement.name} — Kickoff`,
                date: isoDate(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), kickoffDay)),
                clientName: client.name,
                engagementName: engagement.name,
            })

            // Deliverable check-in — current month.
            const deliverableDay = 5 + (engagementIndex % 18)
            events.push({
                id: `demo-cal-evt-${eventIndex++}`,
                engagementId,
                type: 'deliverable',
                title: `${engagement.name} — Deliverable Review`,
                date: isoDate(new Date(thisMonth.getFullYear(), thisMonth.getMonth(), deliverableDay)),
                clientName: client.name,
                engagementName: engagement.name,
            })

            // Document milestone — current month, a few days after the deliverable review.
            const documentDay = Math.min(deliverableDay + 4, 27)
            events.push({
                id: `demo-cal-evt-${eventIndex++}`,
                engagementId,
                type: 'document',
                title: `${engagement.name} — Draft Submitted`,
                date: isoDate(new Date(thisMonth.getFullYear(), thisMonth.getMonth(), documentDay)),
                clientName: client.name,
                engagementName: engagement.name,
            })

            // Due date — next month.
            const dueDay = 8 + (engagementIndex % 15)
            events.push({
                id: `demo-cal-evt-${eventIndex++}`,
                engagementId,
                type: 'due',
                title: `${engagement.name} — Due`,
                date: isoDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay)),
                clientName: client.name,
                engagementName: engagement.name,
            })

            engagementIndex++
        })
    })

    return { engagements, events }
}
