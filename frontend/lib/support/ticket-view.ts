import type { AttachmentMeta } from '@/lib/support-attachment-upload'

/*
 * A support request as the Support page shows it (.claude/plans/app-design-refinements.md, section 14):
 * the app's CustomerRequest row, read for people. Pure, so the app and the tour share it.
 *
 * A request has no title of its own: the first line of what the person wrote is the title, the rest
 * the body. "Last update" says whose turn it is: Firma replied (yours), you, a teammate, or nothing yet.
 */

export type TicketKind = 'BUG' | 'REQUEST' | 'ENQUIRY'
export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
    BUG: 'Bug report',
    REQUEST: 'Feature request',
    ENQUIRY: 'Question',
}

export const TICKET_KIND_HINT: Record<TicketKind, string> = {
    BUG: 'Something isn’t working',
    REQUEST: 'An idea, or something missing',
    ENQUIRY: 'How do I…?',
}

export const TICKET_STATUSES: TicketStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

export type SupportView = 'open' | 'resolved' | 'all'

export function inView(status: TicketStatus, view: SupportView): boolean {
    if (view === 'all') return true
    const open = status === 'NEW' || status === 'IN_PROGRESS'
    return view === 'open' ? open : !open
}

export type SupportComment = {
    id: string
    content: string
    createdAt: string
    authorName: string | null
    authorEmail: string
    /** Written by the Firma team, not the firm. */
    fromFirma: boolean
}

export type SupportPlace = { name: string; slug: string }

export type SupportTicket = {
    ticketNumber: string
    kind: TicketKind
    status: TicketStatus
    title: string
    body: string
    createdAt: string
    updatedAt: string
    firm: SupportPlace | null
    client: SupportPlace | null
    engagement: SupportPlace | null
    raisedBy: { name: string; email: string | null } | null
    /** Filed by the app when an action failed, not by a person. */
    auto: boolean
    /** "Chrome 141 on macOS", from the browser that sent it. */
    browser: string | null
    /** For an automatic one: what failed. */
    failure: { action: string | null; message: string | null } | null
    attachments: AttachmentMeta[]
    comments: SupportComment[]
}

const TITLE_MAX = 120

/** The first line is the title; the rest is the body. */
export function splitDescription(description: string): { title: string; body: string } {
    const lines = description.replace(/\r\n/g, '\n').split('\n')
    const first = lines.findIndex((l) => l.trim() !== '')
    if (first === -1) return { title: 'Untitled request', body: '' }
    const line = lines[first].trim()
    const title = line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line
    const rest = lines.slice(first + 1).join('\n').trim()
    return { title, body: line.length > TITLE_MAX ? [line, rest].filter(Boolean).join('\n') : rest }
}

/** "Chrome 141 on macOS" from a user agent; null when it can't tell. */
export function browserFrom(userAgent: string | null | undefined): string | null {
    if (!userAgent) return null
    const ua = userAgent
    const browser =
        /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
        : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
        : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
        : /Version\/(\d+)[\d.]* .*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
        : null
    const os =
        /iPhone|iPad/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
        : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
        : /Windows/.test(ua) ? 'Windows'
        : /Linux/.test(ua) ? 'Linux'
        : null
    if (!browser && !os) return null
    return browser && os ? `${browser} on ${os}` : (browser ?? os)
}

/** The API's row (GET /api/support/requests) as the page reads it. */
export function toSupportTicket(row: Record<string, any>): SupportTicket {
    const { title, body } = splitDescription(String(row.description ?? ''))
    const meta = (row.metadata ?? {}) as Record<string, any>
    const err = (row.errorDetails ?? {}) as Record<string, any>
    const auto = meta.autoFiled === true
    return {
        ticketNumber: String(row.ticketNumber),
        kind: (row.type ?? 'BUG') as TicketKind,
        status: (row.status ?? 'NEW') as TicketStatus,
        title,
        body,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
        firm: row.firm ?? null,
        client: row.client ?? null,
        engagement: row.engagement ?? null,
        raisedBy: auto ? null : row.raisedBy ?? (row.userEmail ? { name: String(row.userEmail).split('@')[0], email: row.userEmail } : null),
        auto,
        browser: browserFrom(meta.userAgent),
        failure: auto && (err.action || err.message) ? { action: err.action ?? null, message: err.message ?? null } : null,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        comments: (Array.isArray(row.comments) ? row.comments : []).map((c: any) => ({
            id: String(c.id ?? c.createdAt),
            content: String(c.content ?? ''),
            createdAt: String(c.createdAt),
            authorName: c.authorName ?? null,
            authorEmail: String(c.authorEmail ?? ''),
            fromFirma: c.fromFirma === true,
        })),
    }
}

export type LastUpdate = {
    /** "Firma replied", "You", "Sam", "Filed", "Raised". */
    who: string
    at: string
    /** On an open request, it's the viewer's side's turn: Firma spoke last (the firm's), or the firm did (Firma's). */
    yourTurn: boolean
}

/** Which side is looking: the firm on its Support page, or the Firma team answering every firm. */
export type SupportSide = 'firm' | 'firma'

/** Whose word is last on a request, and when. */
export function lastUpdate(t: SupportTicket, myEmail: string | null | undefined, side: SupportSide = 'firm'): LastUpdate {
    const last = t.comments[t.comments.length - 1]
    const open = t.status === 'NEW' || t.status === 'IN_PROGRESS'
    if (!last) return { who: t.auto ? 'Filed' : 'Raised', at: t.updatedAt, yourTurn: side === 'firma' && open }
    const at = last.createdAt > t.updatedAt ? last.createdAt : t.updatedAt
    const mine = !!myEmail && last.authorEmail.toLowerCase() === myEmail.toLowerCase()
    if (last.fromFirma) return { who: side === 'firma' && mine ? 'You' : 'Firma replied', at, yourTurn: side === 'firm' && open }
    const first = (last.authorName ?? last.authorEmail.split('@')[0] ?? '').trim().split(/\s+/)[0]
    return { who: mine ? 'You' : first || 'Someone', at, yourTurn: side === 'firma' && open }
}

/** "DataSentry › Q2 Go-To-Market Positioning", or the firm for a firm-wide request. */
export function wherePath(t: Pick<SupportTicket, 'firm' | 'client' | 'engagement'>): string[] {
    if (t.client && t.engagement) return [t.client.name, t.engagement.name]
    if (t.client) return [t.client.name]
    return [t.firm?.name ?? 'Firm-wide']
}
