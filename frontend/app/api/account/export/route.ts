import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/account/export
 *
 * Everything we hold about the signed-in user, as a JSON download.
 *
 * ## Scope
 *
 * The user's OWN data: who they are, where they are a member, what they did, what their AI use
 * cost. Not the firm's data, and not their colleagues' — a firm admin exporting themselves must
 * not walk out with the client list, and an engagement's documents belong to the firm rather than
 * to whoever happens to ask.
 *
 * That boundary is why this reads by `userId` throughout and never by firm or engagement. Audit
 * rows are the one place it is subtle: a user's own actions are theirs to see, but the same table
 * holds everyone else's, so the filter is `actorUserId` and nothing else.
 *
 * ## Identity, not authorization
 *
 * No role check. Every signed-in user has the right to their own data, and there is nothing here
 * a user could not already see in the app — this is the same information collected into one file.
 */
export async function GET(_request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const [
            personalization, groupMemberships, firmMemberships,
            clientMemberships, engagementMemberships,
            notifications, auditEvents, aiUsage, aiFeedback, requests,
        ] = await Promise.all([
            prisma.userPersonalization.findUnique({ where: { userId: user.id } }),
            prisma.groupMember.findMany({
                where: { userId: user.id },
                select: { role: true, createdAt: true, group: { select: { name: true, slug: true } } },
            }),
            prisma.firmMember.findMany({
                where: { userId: user.id },
                select: { role: true, createdAt: true, firm: { select: { name: true } } },
            }),
            prisma.clientMember.findMany({
                where: { userId: user.id },
                // Role comes from the persona relation here, not a column.
                select: {
                    createdAt: true,
                    client: { select: { name: true } },
                    persona: { select: { displayName: true } },
                },
            }),
            prisma.engagementMember.findMany({
                where: { userId: user.id },
                select: { role: true, createdAt: true, engagement: { select: { name: true } } },
            }),
            prisma.notification.findMany({
                where: { userId: user.id },
                select: { type: true, title: true, body: true, readAt: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            // The user's own actions only. The same table holds everyone else's.
            prisma.platformAuditEvent.findMany({
                where: { actorUserId: user.id },
                select: { eventType: true, scope: true, eventAt: true, metadata: true },
                orderBy: { eventAt: 'desc' },
            }),
            prisma.platformAiUsage.findMany({
                where: { userId: user.id },
                select: { feature: true, model: true, credits: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.platformAiFeedback.findMany({
                where: { userId: user.id },
                select: { feature: true, helpful: true, reason: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.customerRequest.findMany({
                where: { userId: user.id },
                select: {
                    ticketNumber: true, type: true, status: true,
                    description: true, createdAt: true, updatedAt: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
        ])

        const payload = {
            exportedAt: new Date().toISOString(),
            // Stated in the file itself, so a reader knows what they are NOT looking at and does
            // not mistake it for a backup of their engagements.
            scope:
                'Everything FirmaOne holds about this user account. Documents stay in your own '
                + 'storage and are not part of this export; your firm\'s and colleagues\' data is '
                + 'not included.',
            account: {
                id: user.id,
                email: user.email,
                createdAt: user.created_at,
                lastSignInAt: user.last_sign_in_at,
                profile: user.user_metadata ?? {},
            },
            personalization,
            memberships: {
                groups: groupMemberships,
                firms: firmMemberships,
                clients: clientMemberships,
                engagements: engagementMemberships,
            },
            notifications,
            auditActivity: auditEvents,
            aiUsage,
            aiFeedback,
            supportRequests: requests,
        }

        const filename = `firmaone-data-export-${new Date().toISOString().slice(0, 10)}.json`
        return new NextResponse(JSON.stringify(payload, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
                // Never cached: it is personal data and a shared cache must not hold it.
                'Cache-Control': 'no-store, private',
            },
        })
    } catch (error) {
        logger.error('[account/export] failed:', error as Error)
        return NextResponse.json({ error: 'Could not build your export' }, { status: 500 })
    }
}
