import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createPolarClient } from '@/lib/billing/polar-client'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeCheckoutId(body: unknown, reqUrl: URL): string | null {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        const o = body as Record<string, unknown>
        for (const key of ['checkoutId', 'checkout_id', 'checkoutid']) {
            const v = o[key]
            if (typeof v === 'string' && v.trim()) return v.trim()
        }
    }
    for (const key of ['checkoutId', 'checkout_id', 'checkoutid']) {
        const v = reqUrl.searchParams.get(key)
        if (v?.trim()) return v.trim()
    }
    return null
}

/**
 * POST /api/billing/checkout-invoice
 * Body (JSON): `{ checkoutId }` (or `checkout_id` / `checkoutid`).
 *
 * Resolves the paid order for this checkout via Polar, triggers invoice generation,
 * polls for the invoice PDF URL, returns `{ invoiceUrl }` for the signed-in user who
 * owns the checkout (email match or firm membership when `externalCustomerId` is the firm id).
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const reqUrl = new URL(request.url)
        const body = await request.json().catch(() => ({}))
        const checkoutId = normalizeCheckoutId(body, reqUrl)
        if (!checkoutId) {
            return NextResponse.json({ error: 'Missing checkoutId' }, { status: 400 })
        }

        const token = process.env.POLAR_ACCESS_TOKEN?.trim()
        if (!token) {
            return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 })
        }

        const polar = createPolarClient(token)

        const checkout = await polar.checkouts.get({ id: checkoutId })

        const userEmail = (user.email ?? '').trim().toLowerCase()
        const checkoutEmail = (checkout.customerEmail ?? '').trim().toLowerCase()
        const emailMatches = Boolean(userEmail && checkoutEmail && checkoutEmail === userEmail)

        let firmMatches = false
        const externalId = checkout.externalCustomerId?.trim()
        if (externalId) {
            const member = await prisma.firmMember.findFirst({
                where: {
                    userId: user.id,
                    firmId: externalId,
                    firm: { deletedAt: null },
                },
                select: { id: true },
            })
            firmMatches = Boolean(member)
        }

        if (!emailMatches && !firmMatches) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const iter = await polar.orders.list({ checkoutId, limit: 25, page: 1 })
        let items: { id: string; paid: boolean; createdAt: Date }[] = []
        for await (const page of iter) {
            items = page.result.items.map((o) => ({
                id: o.id,
                paid: o.paid,
                createdAt: o.createdAt,
            }))
            break
        }

        const paidOrder = items
            .filter((o) => o.paid)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

        if (!paidOrder) {
            return NextResponse.json(
                {
                    error: 'Order not found for this checkout yet. Wait a few seconds and try again.',
                    code: 'ORDER_PENDING',
                },
                { status: 404 }
            )
        }

        try {
            await polar.orders.generateInvoice({ id: paidOrder.id })
        } catch (genErr) {
            logger.warn('[checkout-invoice] generateInvoice', {
                orderId: paidOrder.id,
                message: genErr instanceof Error ? genErr.message : String(genErr),
            })
        }

        let invoiceUrl: string | null = null
        for (let attempt = 0; attempt < 15; attempt++) {
            if (attempt > 0) await sleep(1000)
            try {
                const inv = await polar.orders.invoice({ id: paidOrder.id })
                if (inv?.url?.trim()) {
                    invoiceUrl = inv.url.trim()
                    break
                }
            } catch {
                // 404 until Polar finishes generating
            }
        }

        if (!invoiceUrl) {
            return NextResponse.json(
                {
                    error:
                        'Invoice is still being generated. Try again in a minute, or open Billing & plans from the app.',
                    code: 'INVOICE_PENDING',
                },
                { status: 202 }
            )
        }

        return NextResponse.json({ invoiceUrl })
    } catch (error) {
        logger.error('checkout-invoice', error instanceof Error ? error : new Error(String(error)))
        return NextResponse.json({ error: 'Could not load invoice' }, { status: 500 })
    }
}
