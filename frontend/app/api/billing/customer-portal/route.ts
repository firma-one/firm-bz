import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { createPolarClient } from '@/lib/billing/polar-client'
import { polarFailure, polarFailureWords } from '@/lib/billing/polar-error-reason'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!accessToken) {
        return NextResponse.json({ error: "Billing isn't set up on this server yet." }, { status: 503 })
    }

    const supabase = await createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Your session has ended. Sign in again, then try again.' }, { status: 401 })
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
            { error: 'Only a firm admin can manage billing for this workspace. Ask an admin for access.' },
            { status: 403 }
        )
    }

    const groupId = await resolveGroupId(firmId)
    const activeSub = await getActiveSubscriptionForGroup(groupId)

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

    const polar = createPolarClient(accessToken)
    try {
        const customerSession = await polar.customerSessions.create({
            externalCustomerId: groupId,
            returnUrl,
        })
        return NextResponse.json({ url: customerSession.customerPortalUrl })
    } catch (e) {
        const failure = polarFailure(e)
        logger.error('Customer portal: Polar refused a customer session', e instanceof Error ? e : new Error(String(e)), 'billing', {
            groupId,
            status: failure.status,
            detail: failure.detail,
        })
        // Only a "not found" from Polar means there is no customer yet; an outage is not that.
        if (failure.kind === 'not_found' && !activeSub?.polarCustomerId) {
            return NextResponse.json(
                { error: 'This workspace has no paid plan with Polar yet. Choose a plan first', code: 'no_customer' },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: polarFailureWords(e) }, { status: 502 })
    }
}
