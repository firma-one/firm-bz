import { ASSISTANT } from '@/lib/ai/assistant'
import { DemoClient, DemoEngagement, DemoFirm, countFilesInFolder } from './static-demo-data'
import { DemoDeliverable, DeliverableStatus, getDemoDeliverables } from './demo-deliverables'
import type { OpeningFact } from '@/lib/ai/chat-suggestions'
import type { FirmChatLink, FirmChatSources } from '@/lib/ai/firm-chat'
import { sortByPace, PACE_META, type FirmEngagementRow } from '@/lib/insights/firm-engagement-pace'

/**
 * What Brio "says" in the public demo. The demo has no backend and no model, so the firm brief and
 * the chat answers are written here — but from the sample data, never as fixed prose, so they
 * always agree with the dashboard, board and file list beside them.
 */

const STATUS_LABEL: Record<DeliverableStatus, string> = {
    to_do: 'to do',
    in_progress: 'in progress',
    in_review: 'in review',
    approved: 'approved',
}

/** "01__Market_&_Competitive_Intelligence_Report" → "Market & Competitive Intelligence Report" */
export function deliverableName(folderName: string): string {
    return folderName.replace(/_+/g, ' ').trim().replace(/^\d+\s+/, '')
}

function startOfToday(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

function daysUntil(iso: string): number {
    const d = new Date(iso)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - startOfToday().getTime()) / 86400000)
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function relative(iso: string): string {
    const n = daysUntil(iso)
    if (n < 0) return `${Math.abs(n)} day${n === -1 ? '' : 's'} overdue`
    if (n === 0) return 'due today'
    if (n === 1) return 'due tomorrow'
    return `due in ${n} days`
}

function money(value: number): string {
    if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`
    return `$${value}`
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

const isOpen = (d: DemoDeliverable) => d.status !== 'approved'

// ─── Firm brief ──────────────────────────────────────────────────────────────

/** The firm Overview's "Today's brief", in the `## Heading` + prose shape BrioSections renders. */
export function buildDemoFirmBrief(firm: DemoFirm): string {
    const active = firm.clients.filter((c) => c.status === 'ACTIVE')
    const engagements = firm.clients.flatMap((c) => c.engagements.map((e) => ({ client: c, engagement: e })))
    const value = (e: DemoEngagement) => Number(e.rateOrValue ?? 0) || 0
    const total = engagements.reduce((s, x) => s + value(x.engagement), 0)

    const byClient = firm.clients
        .map((c) => ({ client: c, value: c.engagements.reduce((s, e) => s + value(e), 0) }))
        .sort((a, b) => b.value - a.value)
    const top = byClient[0]

    const overdue = engagements.flatMap(({ client, engagement }) =>
        getDemoDeliverables(engagement)
            .filter((d) => isOpen(d) && d.dueDate && daysUntil(d.dueDate) < 0)
            .map((d) => ({ client, engagement, d })),
    ).sort((a, b) => (a.d.dueDate! < b.d.dueDate! ? -1 : 1))

    const soonest = engagements
        .filter((x) => x.engagement.dueDate)
        .sort((a, b) => (a.engagement.dueDate! < b.engagement.dueDate! ? -1 : 1))[0]

    const stands = `${plural(active.length, 'active client')} with ${plural(engagements.length, 'live engagement')}, worth ${money(total)} in all.`
        + (top && byClient.length > 1
            ? ` ${top.client.name} carries the largest share, ${money(top.value)} across ${plural(top.client.engagements.length, 'engagement')}.`
            : '')

    const attention = overdue.length === 0
        ? 'Nothing is overdue.'
        : overdue.slice(0, 2).map(({ client, engagement, d }) =>
            `${deliverableName(d.folder.name)} (${engagement.name}, ${client.name}) was due ${shortDate(d.dueDate!)} and is still ${STATUS_LABEL[d.status]}.`,
        ).join(' ') + (overdue.length > 2 ? ` ${plural(overdue.length - 2, 'more deliverable')} also past due.` : '')

    let watching = 'No engagement has a due date yet.'
    if (soonest) {
        const open = getDemoDeliverables(soonest.engagement).filter(isOpen).length
        watching = `${soonest.engagement.name} for ${soonest.client.name} is the next to finish, ${relative(soonest.engagement.dueDate!)}, with ${open} of its deliverables still open.`
    }

    return [
        `## Where things stand\n${stands}`,
        `## Needs attention\n${attention}`,
        `## Worth watching\n${watching}`,
    ].join('\n\n')
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface DemoChatTurn {
    question: string
    answer: string
    /**
     * A firm answer's links line, as the firm chat route appends it: the engagements the answer
     * quotes (the panel links them to the tour's pages) and how many it drew on. Firm Overview only.
     */
    sources?: FirmChatSources
}

/**
 * What the empty demo panel leads with on Overview, like the app's `buildOpeningFacts`: facts from
 * the sample engagement, each asking one of the demo's own questions so it always has an answer.
 * Computed relative to today, so call it in the browser.
 */
export function overviewFacts(engagement: DemoEngagement): OpeningFact[] {
    const open = getDemoDeliverables(engagement).filter(isOpen)
    const facts: OpeningFact[] = []
    const overdue = open.filter((d) => d.dueDate && daysUntil(d.dueDate) < 0).length
    if (overdue > 0) {
        facts.push({ label: `${overdue} deliverable${overdue === 1 ? '' : 's'} overdue`, question: 'What needs my attention this week?', tone: 'red' })
    }
    const inReview = open.filter((d) => d.status === 'in_review').length
    if (inReview > 0) {
        facts.push({ label: `${inReview} deliverable${inReview === 1 ? '' : 's'} waiting on client approval`, question: "What's waiting on client approval?", tone: 'yellow' })
    }
    const dueSoon = open.filter((d) => d.dueDate && daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 14).length
    if (dueSoon > 0 && overdue === 0) {
        facts.push({ label: `${dueSoon} deliverable${dueSoon === 1 ? '' : 's'} due in the next two weeks`, question: 'What needs my attention this week?', tone: 'gray' })
    }
    return facts
}

/** Prompt hints and their answers for the engagement Overview. */
export function overviewChat(client: DemoClient, engagement: DemoEngagement): DemoChatTurn[] {
    const all = getDemoDeliverables(engagement)
    const count = (s: DeliverableStatus) => all.filter((d) => d.status === s).length
    const open = all.filter(isOpen).sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1))
    const next = open[0]

    const summary = [
        `**${engagement.name}** is a ${engagement.contractType ?? 'client'} engagement for ${client.name}`
            + (engagement.dueDate ? `, ${relative(engagement.dueDate)} (${shortDate(engagement.dueDate)}).` : '.'),
        `Of its ${plural(all.length, 'deliverable')}: ${count('approved')} approved, ${count('in_review')} in review, ${count('in_progress')} in progress and ${count('to_do')} to do.`,
        next
            ? `Next up is **${deliverableName(next.folder.name)}**${next.dueDate ? `, ${relative(next.dueDate)}` : ''}, with ${next.actor}.`
            : 'Every deliverable is approved.',
    ].join('\n\n')

    const week = open.filter((d) => d.dueDate && daysUntil(d.dueDate) <= 7)
    const attention = week.length === 0
        ? `Nothing is due or overdue in the next seven days. The next deliverable, **${next ? deliverableName(next.folder.name) : '—'}**, is ${next?.dueDate ? relative(next.dueDate) : 'not scheduled yet'}.`
        : ['These need attention:', '', ...week.map((d) =>
            `- **${deliverableName(d.folder.name)}** — ${STATUS_LABEL[d.status]}, ${relative(d.dueDate!)} (${d.actor})`,
        )].join('\n')

    const review = all.filter((d) => d.status === 'in_review')
    const waiting = review.length === 0
        ? 'Nothing is waiting on the client right now: no deliverable is in review.'
        : [`${plural(review.length, 'deliverable')} ${review.length === 1 ? 'is' : 'are'} in review, waiting for the client's approval:`, '', ...review.map((d) =>
            `- **${deliverableName(d.folder.name)}** — ${plural(d.fileCount, 'file')}${d.dueDate ? `, ${relative(d.dueDate)}` : ''}`,
        )].join('\n')

    return [
        { question: 'Summarize where this engagement stands', answer: summary },
        { question: 'What needs my attention this week?', answer: attention },
        { question: "What's waiting on client approval?", answer: waiting },
    ]
}

/** Prompt hints and their answers for the engagement Files tab. */
export function filesChat(engagement: DemoEngagement): DemoChatTurn[] {
    const deliverables = getDemoDeliverables(engagement)
    const drafts = engagement.folders.find((f) => f.name === 'Drafts')
    const working = engagement.folders.filter((f) => f.name === 'Drafts' || f.name === 'Internal Only')

    const folders = [
        '| Deliverable | Status | Files |',
        '| --- | --- | --- |',
        ...deliverables.map((d) => `| ${deliverableName(d.folder.name)} | ${STATUS_LABEL[d.status]} | ${d.fileCount} |`),
        '',
        working.length > 0
            ? `${working.map((f) => `**${f.name}**`).join(' and ')} ${working.length === 1 ? 'is a working folder' : 'are working folders'}, not deliverables.`
            : '',
    ].join('\n').trim()

    const draftFiles = drafts?.files ?? []
    const draftAnswer = draftFiles.length === 0
        ? 'The Drafts folder is empty.'
        : [`**Drafts** holds ${plural(draftFiles.length, 'file')}:`, '', ...draftFiles.map((f) => `- ${f.name}`)].join('\n')

    const largest = [...deliverables].sort((a, b) => b.fileCount - a.fileCount)[0]
    const largestAnswer = largest
        ? `**${deliverableName(largest.folder.name)}** has the most, with ${plural(countFilesInFolder(largest.folder), 'file')}:\n\n${largest.folder.files.map((f) => `- ${f.name}`).join('\n')}`
        : 'This engagement has no deliverables yet.'

    return [
        { question: 'Which folders are deliverables?', answer: folders },
        { question: "What's still in Drafts?", answer: draftAnswer },
        { question: 'Which deliverable has the most files?', answer: largestAnswer },
    ]
}

/** The reply to anything typed rather than picked: the demo can only answer its own prompts. */
export const DEMO_FREEFORM_REPLY =
    `This is a demo, so ${ASSISTANT.name} answers the suggested questions from the sample data. `
    + `Sign up to ask about your own engagements.`

// ─── Firm chat ───────────────────────────────────────────────────────────────

const FIRM_SLIPPING = 'Which engagements are slipping?'
const FIRM_DUE_THIS_WEEK = 'What is due across the firm this week?'
const FIRM_UNTRACKED = "Which engagements can't be tracked yet?"
/** The firm Overview's prompt hints, in the order the panel offers them. */
export const DEMO_FIRM_CHAT_QUESTIONS = [FIRM_SLIPPING, FIRM_DUE_THIS_WEEK, FIRM_UNTRACKED]

/** The firm Overview's reply to anything typed rather than picked. */
export const DEMO_FIRM_FREEFORM_REPLY =
    `This is a demo, so ${ASSISTANT.name} answers the suggested questions from the sample data. `
    + 'Sign up to ask about your own firm.'

const firmLink = (r: FirmEngagementRow): FirmChatLink => ({ name: r.name, clientSlug: r.clientSlug, slug: r.slug })

export interface DemoFirmCanned {
    answer: string
    named: FirmEngagementRow[]
}

/**
 * Canned answers for the firm Overview in the shape the model writes them (quoted names, a table),
 * built from the sample firm's rows, so the tour shows what the app does without a model call.
 * `named` is the engagements the answer quotes: what the route would resolve into links.
 */
export function demoFirmCannedAnswer(question: string, rows: FirmEngagementRow[], nowMs: number): DemoFirmCanned | null {
    const paced = sortByPace(rows, nowMs)
    if (question === FIRM_SLIPPING) {
        const slipping = paced.filter((r) => ['overdue', 'behind', 'slightly_behind'].includes(r.pace.key) || r.deliverables.overdue > 0)
        if (slipping.length === 0) {
            return { answer: 'Nothing is slipping. Every engagement in progress is on pace, or can\'t be tracked yet.', named: [] }
        }
        const late = slipping.filter((r) => r.pace.key === 'overdue').length
        const table = [
            '| Engagement | Client | Pace | Overdue | Due date |',
            '|---|---|---|---|---|',
            ...slipping.map((r) => {
                const due = r.dueDate ? `${shortDate(r.dueDate)}${r.pace.key === 'overdue' ? ' · passed' : ''}` : 'Not set'
                const overdue = r.deliverables.overdue > 0 ? plural(r.deliverables.overdue, 'deliverable') : 'None'
                return `| "${r.name}" | ${r.clientName} | ${PACE_META[r.pace.key].label} | ${overdue} | ${due} |`
            }),
        ].join('\n')
        return {
            answer: `**${plural(slipping.length, 'engagement')}** ${slipping.length === 1 ? 'is' : 'are'} slipping`
                + (late > 0 ? `; ${late} ${late === 1 ? 'is' : 'are'} past ${late === 1 ? 'its' : 'their'} due date.` : '.')
                + `\n\n${table}`,
            named: slipping,
        }
    }
    if (question === FIRM_DUE_THIS_WEEK) {
        const week = paced.filter((r) => r.pace.daysLeft != null && r.pace.daysLeft >= 0 && r.pace.daysLeft <= 7)
        if (week.length > 0) {
            return {
                answer: `**${plural(week.length, 'engagement')}** ${week.length === 1 ? 'is' : 'are'} due in the next 7 days:\n\n`
                    + week.map((r) => `- "${r.name}" for "${r.clientName}", due ${shortDate(r.dueDate!)}, `
                        + `${plural(r.deliverables.total - r.deliverables.approved, 'deliverable')} not yet approved`).join('\n'),
                named: week,
            }
        }
        const next = paced
            .filter((r) => r.pace.daysLeft != null && r.pace.daysLeft > 7)
            .sort((a, b) => (a.pace.daysLeft ?? 0) - (b.pace.daysLeft ?? 0))[0]
        return {
            answer: 'No engagement is due in the next 7 days.'
                + (next ? ` The next is "${next.name}" for "${next.clientName}", due ${shortDate(next.dueDate!)}, in ${plural(next.pace.daysLeft ?? 0, 'day')}.` : ''),
            named: next ? [next] : [],
        }
    }
    if (question === FIRM_UNTRACKED) {
        const untracked = paced.filter((r) => r.pace.key === 'no_due_date' || r.pace.key === 'no_deliverables')
        if (untracked.length === 0) {
            return { answer: 'Every engagement in progress has a due date and deliverables, so each one can be tracked for pace.', named: [] }
        }
        return {
            answer: `**${plural(untracked.length, 'engagement')}** can't be tracked yet:\n\n`
                + untracked.map((r) => `- "${r.name}" for "${r.clientName}": ${r.pace.key === 'no_due_date' ? 'no due date' : 'no deliverables yet'}`).join('\n'),
            named: untracked,
        }
    }
    return null
}

/**
 * Prompt hints and their answers for the firm Overview (Ask Brio about the firm), each with the
 * links line the route would send. Computed relative to `nowMs`, so call it in the browser.
 */
export function firmChat(rows: FirmEngagementRow[], nowMs: number): DemoChatTurn[] {
    return DEMO_FIRM_CHAT_QUESTIONS.flatMap((question) => {
        const canned = demoFirmCannedAnswer(question, rows, nowMs)
        return canned
            ? [{ question, answer: canned.answer, sources: { engagements: canned.named.map(firmLink), drewOn: rows.length } }]
            : []
    })
}
