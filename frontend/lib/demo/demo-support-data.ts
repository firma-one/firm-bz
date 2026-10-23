import type { SupportTicket } from '@/lib/support/ticket-view'
import { DEMO_FIRM } from './static-demo-data'

/*
 * The tour's Support requests (components/demo/demo-support.tsx): a few the demo firm has raised with
 * the Firma team, in every status, dated from the viewer's today. Every answer describes something the
 * app really does.
 */

export const DEMO_SUPPORT_ME = { name: 'Demo User', email: 'demo@firma.bz' }

const HOUR = 3_600_000
const DAY = 24 * HOUR

const place = (clientIndex: number, engagementIndex: number) => {
    const client = DEMO_FIRM.clients[clientIndex]
    const engagement = client?.engagements[engagementIndex]
    return {
        client: client ? { name: client.name, slug: client.slug } : null,
        engagement: client && engagement ? { name: engagement.name, slug: engagement.slug } : null,
    }
}

const FIRMA = (content: string, at: Date) => ({ id: `f-${at.getTime()}`, content, createdAt: at.toISOString(), authorName: 'Firma Support', authorEmail: 'support@firma.bz', fromFirma: true })
const PERSON = (name: string, email: string, content: string, at: Date) => ({ id: `p-${at.getTime()}`, content, createdAt: at.toISOString(), authorName: name, authorEmail: email, fromFirma: false })

const SAM = { name: 'Sam Rivera', email: 'sam@beacongrowth.com' }
const CONSOLE_LOG = 'Upload failed: request timed out after 99% (file: launch-video.mp4, 140 MB)\n'

export function demoSupportTickets(now: Date): SupportTicket[] {
    const ago = (ms: number) => new Date(now.getTime() - ms)
    const firm = { name: DEMO_FIRM.name, slug: 'demo' }
    const base = { firm, browser: 'Chrome 141 on macOS', failure: null, attachments: [] as SupportTicket['attachments'] }

    return [
        {
            ...base, ...place(0, 0),
            ticketNumber: 'TKT-8F2K1Q', kind: 'BUG', status: 'IN_PROGRESS',
            title: 'Upload stops at 99% for files over 100 MB',
            body: 'Uploading a 140 MB launch video to Files stops at 99% and says “Upload failed”. Smaller files go through. Tried twice in Chrome and once in Safari.',
            createdAt: ago(2 * DAY).toISOString(), updatedAt: ago(2 * HOUR).toISOString(),
            raisedBy: DEMO_SUPPORT_ME, auto: false,
            attachments: [{
                attachmentId: 'demo-console', originalName: 'console.txt', storedName: 'console.txt', mimeType: 'text/plain',
                size: CONSOLE_LOG.length, blobData: `data:text/plain;charset=utf-8,${encodeURIComponent(CONSOLE_LOG)}`,
            }],
            comments: [
                PERSON(DEMO_SUPPORT_ME.name, DEMO_SUPPORT_ME.email, 'Only on this engagement as far as I can tell. Other uploads are fine.', ago(2 * DAY - 3 * HOUR)),
                FIRMA('Thanks, we can reproduce it and are working on a fix. Until then, adding the file in Google Drive works: it shows up in Files on the next refresh.', ago(2 * HOUR)),
            ],
        },
        {
            ...base, ...place(0, 1),
            ticketNumber: 'TKT-3HD9XA', kind: 'BUG', status: 'NEW',
            title: 'Couldn’t promote a folder to a deliverable',
            body: '',
            createdAt: ago(1 * DAY).toISOString(), updatedAt: ago(1 * DAY).toISOString(),
            raisedBy: null, auto: true, browser: null,
            failure: { action: 'Promote Folder to Deliverable', message: 'Google Drive returned 403: the connected account can’t share this folder.' },
            comments: [],
        },
        {
            ...base, client: null, engagement: null,
            ticketNumber: 'TKT-Q7M2LD', kind: 'REQUEST', status: 'NEW',
            title: 'Ask before moving a deliverable to the Bin',
            body: 'A confirmation would help: deliverables have client history attached, and one slip is costly.',
            createdAt: ago(3 * DAY).toISOString(), updatedAt: ago(3 * DAY).toISOString(),
            raisedBy: SAM, auto: false,
            comments: [PERSON(SAM.name, SAM.email, 'Undo covers it today, but a prompt for deliverables would still be nice.', ago(3 * DAY - HOUR))],
        },
        {
            ...base, ...place(1, 0),
            ticketNumber: 'TKT-W1C8RT', kind: 'ENQUIRY', status: 'RESOLVED',
            title: 'How do I give a client access to just one deliverable?',
            body: '',
            createdAt: ago(6 * DAY).toISOString(), updatedAt: ago(5 * DAY).toISOString(),
            raisedBy: SAM, auto: false,
            comments: [FIRMA('Promote the folder to a deliverable, then share it with the client from its menu. They see only what you share with them.', ago(5 * DAY))],
        },
        {
            ...base, client: null, engagement: null,
            ticketNumber: 'TKT-ZP4N6E', kind: 'BUG', status: 'RESOLVED',
            title: 'Calendar shows due dates a day early',
            body: 'Set a due date of the 30th; the calendar shows it on the 29th. We’re in New York.',
            createdAt: ago(9 * DAY).toISOString(), updatedAt: ago(8 * DAY).toISOString(),
            raisedBy: DEMO_SUPPORT_ME, auto: false,
            comments: [FIRMA('Fixed: a date without a time now keeps its day in every time zone.', ago(8 * DAY))],
        },
        {
            ...base, ...place(1, 1),
            ticketNumber: 'TKT-K2V7HS', kind: 'REQUEST', status: 'CLOSED',
            title: 'Download a whole deliverable at once',
            body: '',
            createdAt: ago(14 * DAY).toISOString(), updatedAt: ago(13 * DAY).toISOString(),
            raisedBy: DEMO_SUPPORT_ME, auto: false,
            comments: [PERSON(DEMO_SUPPORT_ME.name, DEMO_SUPPORT_ME.email, 'Selecting the files and choosing Download does what we need. Closing.', ago(13 * DAY))],
        },
    ]
}
