import 'server-only'

import { prisma } from '@/lib/prisma'
import { isSystemAdminEmail } from '@/lib/system/admin-check'
import { loadPeople } from '@/lib/files/file-creator'

/*
 * Support requests as the Support pages read them (.claude/plans/app-design-refinements.md, section 14):
 * each row with its firm, client and engagement names, who raised it (by profile name), and which
 * replies are the Firma team's. Shared by GET /api/support/requests (a firm's Support page) and the
 * Firma team's view of every firm's requests.
 */

/**
 * A reply is the Firma team's when its author is on the team (SYSTEM_ADMIN_EMAILS) and not a member of
 * the request's firm: a team member who is in that firm speaks for the firm.
 */
export function isFirmaAuthor(email: string | null | undefined, memberOfTicketFirm: boolean): boolean {
    return isSystemAdminEmail(email) && !memberOfTicketFirm
}

export async function isMemberOfFirm(userId: string, firmId: string | null | undefined): Promise<boolean> {
    if (!firmId) return false
    const m = await prisma.firmMember.findFirst({ where: { firmId, userId }, select: { id: true } })
    return !!m
}

export async function enrichSupportRequests(requests: any[]): Promise<Record<string, unknown>[]> {
    const authorIds = new Set<string>()
    for (const req of requests) {
        if (req.userId) authorIds.add(req.userId)
        for (const c of Array.isArray(req.comments) ? req.comments : []) if (c?.createdBy) authorIds.add(c.createdBy)
    }
    const firmIds = Array.from(new Set(requests.map((r) => r.firmId).filter(Boolean))) as string[]
    const clientIds = Array.from(new Set(requests.map((r) => r.clientId).filter(Boolean))) as string[]
    const engagementIds = Array.from(new Set(requests.map((r) => r.engagementId).filter(Boolean))) as string[]

    const [people, memberships, firms, clients, engagements] = await Promise.all([
        loadPeople(Array.from(authorIds)),
        firmIds.length && authorIds.size
            ? prisma.firmMember.findMany({ where: { firmId: { in: firmIds }, userId: { in: Array.from(authorIds) } }, select: { firmId: true, userId: true } })
            : [],
        firmIds.length ? prisma.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true, slug: true } }) : [],
        clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, slug: true } }) : [],
        engagementIds.length ? prisma.engagement.findMany({ where: { id: { in: engagementIds } }, select: { id: true, name: true, slug: true } }) : [],
    ])
    const inFirm = new Set(memberships.map((m) => `${m.firmId}:${m.userId}`))
    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
    const firmById = byId(firms)
    const clientById = byId(clients)
    const engagementById = byId(engagements)
    const place = (row: { name: string; slug: string } | undefined) => (row ? { name: row.name, slug: row.slug } : null)

    return requests.map((req) => {
        const raiser = req.userId ? people.get(req.userId) : undefined
        return {
            ...req,
            firm: place(req.firmId ? firmById.get(req.firmId) : undefined),
            client: place(req.clientId ? clientById.get(req.clientId) : undefined),
            engagement: place(req.engagementId ? engagementById.get(req.engagementId) : undefined),
            raisedBy: raiser ? { name: raiser.name, email: raiser.email } : null,
            comments: (Array.isArray(req.comments) ? req.comments : []).map((c: any) => ({
                ...c,
                fromFirma: isFirmaAuthor(c?.authorEmail, !!(req.firmId && c?.createdBy && inFirm.has(`${req.firmId}:${c.createdBy}`))),
            })),
        }
    })
}
