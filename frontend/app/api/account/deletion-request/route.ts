import { NextRequest, NextResponse } from 'next/server'
import { TicketType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { submitErrorTicket } from '@/app/actions/submit-ticket'
import { logger } from '@/lib/logger'
import { DELETION_REQUEST_KIND } from '@/lib/account/deletion-plan'

export const dynamic = 'force-dynamic'


/**
 * POST /api/account/deletion-request
 *
 * Raises a request to delete the signed-in user's account.
 *
 * ## Why a request rather than a button that deletes
 *
 * Deleting an account cascades across firms, clients, engagements and the auth record, and some of
 * what it touches is shared — a workspace with colleagues in it is not one member's to remove. A
 * request means a person checks what will actually happen before it happens, and the requester
 * gets a confirmation naming what was erased and what was kept. Both are promised in the privacy
 * policy, and neither survives a one-click cascade.
 *
 * It rides on CustomerRequest rather than a table of its own: ticket numbers, a status workflow
 * and a comment thread already exist there, and a deletion request needs exactly those.
 *
 * ## One open request at a time
 *
 * A second request while one is open is a no-op that returns the existing ticket. Someone clicking
 * twice because nothing visibly happened should not create a second queue item for the same
 * account.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => null) as { reason?: unknown } | null
        const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : ''

        const existing = await prisma.customerRequest.findFirst({
            where: {
                userId: user.id,
                status: { in: ['NEW', 'IN_PROGRESS'] },
                metadata: { path: ['kind'], equals: DELETION_REQUEST_KIND },
            },
            select: { ticketNumber: true, createdAt: true },
        })
        if (existing) {
            return NextResponse.json({
                data: { ticketNumber: existing.ticketNumber, requestedAt: existing.createdAt, alreadyOpen: true },
            })
        }

        const result = await submitErrorTicket({
            type: TicketType.REQUEST,
            description: reason
                ? `Account deletion requested. Reason given: ${reason}`
                : 'Account deletion requested.',
            metadata: {
                kind: DELETION_REQUEST_KIND,
                // Captured at request time: the account is about to be erased, so after fulfilment
                // there is nothing left to join back to.
                requestedBy: { userId: user.id, email: user.email },
                requestedAt: new Date().toISOString(),
            },
        })

        if (!result.success || !result.ticketNumber) {
            return NextResponse.json({ error: 'Could not raise the request' }, { status: 500 })
        }

        return NextResponse.json({
            data: { ticketNumber: result.ticketNumber, requestedAt: new Date().toISOString(), alreadyOpen: false },
        })
    } catch (error) {
        logger.error('[account/deletion-request] failed:', error as Error)
        return NextResponse.json({ error: 'Could not raise the request' }, { status: 500 })
    }
}

/**
 * GET /api/account/deletion-request
 *
 * The user's open deletion request, if there is one, so the settings page can show its state
 * rather than offering a button that has already been pressed.
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const open = await prisma.customerRequest.findFirst({
            where: {
                userId: user.id,
                status: { in: ['NEW', 'IN_PROGRESS'] },
                metadata: { path: ['kind'], equals: DELETION_REQUEST_KIND },
            },
            select: { ticketNumber: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json({ data: { open } })
    } catch (error) {
        logger.error('[account/deletion-request] GET failed:', error as Error)
        return NextResponse.json({ data: { open: null } })
    }
}
