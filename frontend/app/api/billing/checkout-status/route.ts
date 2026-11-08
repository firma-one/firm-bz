import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { createPolarClient } from '@/lib/billing/polar-client'
import { polarFailureWords } from '@/lib/billing/polar-error-reason'
import { checkoutGroupId, userOwnsCheckout } from '@/lib/billing/checkout-ownership'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'

/**
 * Where a checkout stands, for `/checkout/success`, which used to say "You're all set" from the URL
 * alone. The plan is active once our own subscription row for the group shows it, since that is what
 * Billing reads: Polar can have taken the money while the webhook hasn't landed (or matched no group).
 *
 * GET ?checkoutId=…[&final=1]
 * → { state: 'active' | 'activating' | 'awaiting_payment' | 'not_paid' }
 *
 * `final=1` is the page giving up waiting: a payment still not active by then is logged as an error,
 * so an operator hears of it (the page says it has been reported).
 */

type CheckoutActivationState = 'active' | 'activating' | 'awaiting_payment' | 'not_paid'

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
        return NextResponse.json({ error: 'Your session has ended. Sign in again, then try again.' }, { status: 401 })
    }

    const url = new URL(request.url)
    const checkoutId = url.searchParams.get('checkoutId')?.trim()
    if (!checkoutId) {
        return NextResponse.json({ error: 'No checkout was named.' }, { status: 400 })
    }
    const final = url.searchParams.get('final') === '1'

    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) {
        return NextResponse.json({ error: "Billing isn't set up on this server yet." }, { status: 503 })
    }

    const polar = createPolarClient(token)
    let checkout: Awaited<ReturnType<typeof polar.checkouts.get>>
    try {
        checkout = await polar.checkouts.get({ id: checkoutId })
    } catch (e) {
        logger.warn('[checkout-status] checkouts.get failed', { checkoutId, message: e instanceof Error ? e.message : String(e) })
        return NextResponse.json({ error: polarFailureWords(e) }, { status: 502 })
    }

    if (!(await userOwnsCheckout(user, checkout))) {
        return NextResponse.json({ error: "This checkout isn't yours to see." }, { status: 403 })
    }

    const polarStatus = String(checkout.status ?? '').toLowerCase()
    if (polarStatus === 'expired' || polarStatus === 'failed') {
        return NextResponse.json({ state: 'not_paid' satisfies CheckoutActivationState })
    }

    const groupId = checkoutGroupId(checkout)
    const row = groupId ? await getActiveSubscriptionForGroup(groupId) : null
    const productNames = new Set(
        [checkout.product?.name, ...(checkout.products ?? []).map((p) => p.name)]
            .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
            .map((n) => n.trim())
    )
    const active = Boolean(
        row &&
            ((checkout.subscriptionId && row.polarSubscriptionId === checkout.subscriptionId) ||
                (row.plan && productNames.has(row.plan.trim())))
    )
    if (active) {
        return NextResponse.json({ state: 'active' satisfies CheckoutActivationState })
    }

    if (polarStatus === 'open') {
        return NextResponse.json({ state: 'awaiting_payment' satisfies CheckoutActivationState })
    }

    if (final) {
        logger.error(
            'Checkout paid, but the plan is not active in Firma',
            new Error(`Checkout ${checkoutId} is ${polarStatus} at Polar, no active plan for group ${groupId ?? '(none)'}`),
            'billing',
            { checkoutId, groupId, polarStatus, products: Array.from(productNames), activePlan: row?.plan ?? null }
        )
    }
    return NextResponse.json({ state: 'activating' satisfies CheckoutActivationState })
}
