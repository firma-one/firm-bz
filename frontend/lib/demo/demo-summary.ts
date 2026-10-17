import { LEAD_PLACEHOLDER } from '@/lib/ai/summary-sections'

/**
 * The tour's engagement summary, written from the engagement's own sample data in the same seven
 * sections Brio writes for real (lib/ai/summary-sections.ts). No AI call: the tour has no backend.
 * Used twice — as the summary already published on the Overview, and as the draft the tour's
 * "Rewrite with Brio" types out, which leaves the lead's two sections for the visitor to fill in.
 */

export interface DemoSummaryDeliverable {
    docId: string | null
    name: string
    stage: 'to_do' | 'in_progress' | 'in_review' | 'approved'
    dueDate: string | null
    isOverdue: boolean
}

export interface DemoSummaryInput {
    engagementName: string
    deliverables: DemoSummaryDeliverable[]
    /** Share of the engagement's time used, and of deliverables approved. */
    timePct: number
    deliveredPct: number
    daysLeft: number | null
    planningGaps: number
    resolvedThreads: number
}

const DAY = 86400000

/** "01__Market_&_Competitive_Intelligence_Report" → "Market & Competitive Intelligence Report". */
export function prettyName(folderName: string): string {
    return folderName.replace(/^\d+_+/, '').replace(/_+/g, ' ').trim()
}

const ref = (d: DemoSummaryDeliverable) => `${d.docId ? `${d.docId} — ` : ''}${prettyName(d.name)}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
const list = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/**
 * The summary as markdown. `leadFilled` writes the lead's sections as a lead would have (the
 * published sample); without it they hold Brio's placeholder, so publishing waits for the visitor.
 */
export function buildDemoSummary(input: DemoSummaryInput, { leadFilled }: { leadFilled: boolean }): string {
    const { deliverables: ds } = input
    const total = ds.length
    const approved = ds.filter((d) => d.stage === 'approved')
    const inReview = ds.filter((d) => d.stage === 'in_review')
    const inProgress = ds.filter((d) => d.stage === 'in_progress')
    const toDo = ds.filter((d) => d.stage === 'to_do')
    const overdue = ds.filter((d) => d.isOverdue)
    const behind = input.timePct - input.deliveredPct > 15
    const nextDue = ds
        .filter((d) => d.stage !== 'approved' && d.dueDate && !d.isOverdue)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0]

    const summary = `${input.engagementName} is ${input.timePct}% of the way through its timeline`
        + `${input.daysLeft !== null && input.daysLeft >= 0 ? `, with ${input.daysLeft} days left` : ''},`
        + ` and ${approved.length} of ${total} deliverables are approved.`
        + (behind ? ' Delivery is running behind the clock.' : ' Delivery is keeping pace with the clock.')

    const progress = [
        approved.length ? `${list(approved.map(ref))} ${approved.length === 1 ? 'is' : 'are'} approved.` : '',
        inReview.length ? `${list(inReview.map(ref))} ${inReview.length === 1 ? 'is' : 'are'} with the client for review.` : '',
        inProgress.length ? `${list(inProgress.map(ref))} ${inProgress.length === 1 ? 'is' : 'are'} in progress.` : '',
        toDo.length ? `${list(toDo.map(ref))} ${toDo.length === 1 ? 'has' : 'have'} not started.` : '',
    ].filter(Boolean).join(' ')

    const collaboration = input.resolvedThreads > 0
        ? `${input.resolvedThreads} comment threads, all answered by the firm. No client replies are waiting.`
        : 'No comment threads yet.'

    const risks = [
        ...overdue.map((d) => `${ref(d)} is past its ${day(d.dueDate!)} due date and not yet approved.`),
        behind ? `${input.deliveredPct}% of deliverables are approved with ${input.timePct}% of the time used.` : '',
        input.planningGaps > 0 ? `${input.planningGaps} planning fields are still missing — due dates and owners on supporting documents.` : '',
    ].filter(Boolean).join(' ') || 'Nothing material.'

    const needsAttention = [
        inReview.length ? `Get ${list(inReview.map((d) => d.docId ?? prettyName(d.name)))} reviewed and approved.` : '',
        input.planningGaps > 0 ? 'Assign owners and due dates to the open documents.' : '',
        overdue.length ? `Agree a new date for ${list(overdue.map((d) => d.docId ?? prettyName(d.name)))}.` : '',
    ].filter(Boolean).join(' ') || 'Nothing requires immediate attention.'

    const mitigation = leadFilled
        ? 'Weekly check-ins with the client until every deliverable is signed off. If review slips, the final deliverable ships in two drops so the first lands on time.'
        : LEAD_PLACEHOLDER
    const nextSteps = leadFilled
        ? `${nextDue ? `Walk the client through ${nextDue.docId ?? prettyName(nextDue.name)} before ${day(new Date(new Date(nextDue.dueDate!).getTime() - 2 * DAY).toISOString())}. ` : ''}Close the remaining planning gaps this week.`
        : LEAD_PLACEHOLDER

    return [
        `## Summary\n${summary}`,
        `## Progress\n${progress || 'No deliverables yet.'}`,
        `## Collaboration\n${collaboration}`,
        `## Risks\n${risks}`,
        `## Mitigation & Contingency\n${mitigation}`,
        `## Needs Attention\n${needsAttention}`,
        `## Next Steps\n${nextSteps}`,
    ].join('\n\n')
}
