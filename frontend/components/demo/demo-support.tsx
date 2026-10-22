'use client'

import { useState } from 'react'
import { SupportView } from '@/components/support/support-view'
import type { SupportSource } from '@/components/support/support-store'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { DEMO_SUPPORT_ME, demoSupportTickets } from '@/lib/demo/demo-support-data'
import type { SupportTicket } from '@/lib/support/ticket-view'
import { splitDescription } from '@/lib/support/ticket-view'

/**
 * The app's Support page (components/support/support-view.tsx) over the tour's sample requests. A new
 * request, a reply, a status change or a file changes only the list on screen; nothing is sent.
 */
function demoSource(): SupportSource {
    let tickets: SupportTicket[] = demoSupportTickets(new Date())
    let next = 1
    const update = (ticketNumber: string, fn: (t: SupportTicket) => SupportTicket) => {
        tickets = tickets.map((t) => (t.ticketNumber === ticketNumber ? fn(t) : t))
    }
    return {
        load: async () => tickets,
        create: async (input) => {
            const now = new Date().toISOString()
            const ticketNumber = `TKT-DEMO${String(next++).padStart(2, '0')}`
            const client = DEMO_FIRM.clients.find((c) => c.slug === input.clientSlug)
            const engagement = client?.engagements.find((e) => e.slug === input.engagementSlug)
            const { title, body } = splitDescription(input.description)
            tickets = [{
                ticketNumber, kind: input.kind, status: 'NEW', title, body, createdAt: now, updatedAt: now,
                firm: { name: DEMO_FIRM.name, slug: 'demo' },
                client: client ? { name: client.name, slug: client.slug } : null,
                engagement: engagement ? { name: engagement.name, slug: engagement.slug } : null,
                raisedBy: DEMO_SUPPORT_ME, auto: false, browser: null, failure: null, attachments: [], comments: [],
            }, ...tickets]
            return ticketNumber
        },
        addComment: async (ticketNumber, content) => {
            const comment = { id: `c-${Date.now()}`, content, createdAt: new Date().toISOString(), authorName: DEMO_SUPPORT_ME.name, authorEmail: DEMO_SUPPORT_ME.email, fromFirma: false }
            update(ticketNumber, (t) => ({ ...t, comments: [...t.comments, comment] }))
            return comment
        },
        setStatus: async (ticketNumber, status) => update(ticketNumber, (t) => ({ ...t, status })),
        addFiles: async (ticketNumber, files) => {
            // Read in the browser only, so a download hands back the same file.
            const attached = await Promise.all(files.map((f) => new Promise<SupportTicket['attachments'][number]>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve({ attachmentId: `a-${Date.now()}-${f.name}`, originalName: f.name, storedName: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, blobData: String(reader.result) })
                reader.readAsDataURL(f)
            })))
            update(ticketNumber, (t) => ({ ...t, attachments: [...t.attachments, ...attached] }))
            return { attached, failed: 0 }
        },
        removeFile: async (ticketNumber, attachmentId) => update(ticketNumber, (t) => ({ ...t, attachments: t.attachments.filter((a) => a.attachmentId !== attachmentId) })),
    }
}

export function DemoSupport() {
    const [source] = useState(demoSource)
    const engagements = DEMO_FIRM.clients.flatMap((c) =>
        c.engagements.map((e) => ({ clientSlug: c.slug, clientName: c.name, engagementSlug: e.slug, engagementName: e.name }))
    )
    return (
        <SupportView
            firmSlug="demo"
            firmName={DEMO_FIRM.name}
            myEmail={DEMO_SUPPORT_ME.email}
            engagements={engagements}
            source={source}
            engagementHrefTemplate="/tour/{client}/{engagement}"
        />
    )
}
