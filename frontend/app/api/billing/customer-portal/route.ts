import { NextRequest, NextResponse } from 'next/server'
import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { getActiveSubscriptionForFirm } from '@/lib/billing/active-billing-subscription'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'

function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

export async function POST(request: NextRequest) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!accessToken) {
        return NextResponse.json({ error: 'Polar is not configured.' }, { status: 503 })
    }

    const supabase = await createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const firmId = typeof body.firmId === 'string' ? body.firmId.trim() : ''
    if (!firmId) {
        return NextResponse.json({ error: 'Missing firmId' }, { status: 400 })
    }

    const userId = session.user.id
    const adminMembership = await prisma.firmMember.findFirst({
        where: {
            firmId,
            userId,
            role: 'firm_admin',
            firm: { deletedAt: null },
        },
        select: { id: true },
    })
    if (!adminMembership) {
        return NextResponse.json(
            { error: 'Only firm admins can open the billing portal for this workspace.' },
            { status: 403 }
        )
    }

    const anchorId = await resolveBillingAnchorFirmId(firmId)
    const activeSub = await getActiveSubscriptionForFirm(anchorId)

    const returnToRaw = typeof body.returnTo === 'string' ? body.returnTo : undefined
    const validatedReturnPath = validateCheckoutReturnTo(returnToRaw ?? null)

    const origin = request.headers.get('origin')?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ''
    let returnUrl: string | null = null
    try {
        if (origin) {
            const pathForReturn = validatedReturnPath ?? '/d/u/profile'
            returnUrl = new URL(pathForReturn, origin).toString()
        }
    } catch {
        returnUrl = null
    }

    const polar = new Polar({ accessToken, server: polarServer() })
    const customerSession = await polar.customerSessions
        .create({
            externalCustomerId: anchorId,
            returnUrl,
        })
        .catch(() => null)
    if (!customerSession) {
        if (!activeSub?.polarCustomerId) {
            return NextResponse.json(
                { error: 'No Polar customer on file yet. Complete checkout first, then try again.' },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: 'Could not open billing portal right now.' }, { status: 502 })
    }

    return NextResponse.json({ url: customerSession.customerPortalUrl })
}
