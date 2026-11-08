import { Checkout } from '@polar-sh/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { polarServer } from '@/lib/billing/polar-client'
import { fetchBillingCatalogPlans } from '@/lib/billing/polar-catalog'
import { logger } from '@/lib/logger'
import { CHECKOUT_ERROR_PARAM } from '@/lib/billing/checkout-error-param'

/**
 * The plan buttons send the whole tab here (`window.location.assign`), so an answer in JSON would land
 * on a bare page. A page navigation that fails goes back where it came from, carrying the reason;
 * a fetch (or a Bearer caller) still gets JSON.
 */
function isPageNavigation(request: NextRequest): boolean {
    if (request.headers.get('authorization')) return false
    if (request.headers.get('sec-fetch-mode') === 'navigate') return true
    return (request.headers.get('accept') ?? '').includes('text/html')
}

/**
 * Back to Billing, where the reason is shown: the page the button was on when that was Billing (or
 * onboarding's billing step), else `/d/billing` with that page as its `returnTo`. Same app, /d/ only.
 */
function backToBilling(request: NextRequest): URL {
    const base = new URL(request.url)
    const billing = new URL('/d/billing', base.origin)
    const referer = request.headers.get('referer')
    if (!referer) return billing
    let path: string | null = null
    try {
        const ref = new URL(referer)
        path = ref.origin === base.origin ? validateCheckoutReturnTo(`${ref.pathname}${ref.search}`) : null
    } catch {
        path = null
    }
    if (!path) return billing
    const back = new URL(path, base.origin)
    back.searchParams.delete(CHECKOUT_ERROR_PARAM)
    if (back.pathname.startsWith('/d/billing') || back.pathname.startsWith('/d/onboarding')) return back
    billing.searchParams.set('returnTo', path)
    return billing
}

function checkoutFailed(request: NextRequest, status: number, error: string): Response {
    if (!isPageNavigation(request)) {
        return NextResponse.json({ error }, { status })
    }
    const back = backToBilling(request)
    back.searchParams.set(CHECKOUT_ERROR_PARAM, error)
    return NextResponse.redirect(back, 303)
}

async function checkoutHandler(request: NextRequest) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN
    const successUrlEnv = process.env.POLAR_SUCCESS_URL
    if (!accessToken?.trim() || !successUrlEnv?.trim()) {
        logger.error(
            'Checkout: POLAR_ACCESS_TOKEN or POLAR_SUCCESS_URL is not set',
            new Error('Polar checkout is not configured'),
            'billing'
        )
        return checkoutFailed(request, 503, "Checkout isn't set up on this server yet.")
    }

    const reqUrl = new URL(request.url)
    const firmId = reqUrl.searchParams.get('firmId')?.trim()
    if (!firmId) {
        return checkoutFailed(request, 400, 'No workspace was chosen for this checkout. Open Billing from your workspace, then try again.')
    }

    let userId: string | null = null
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim()
        const supabase = createAdminClient()
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token)
        if (authError || !user?.id) {
            return checkoutFailed(request, 401, 'Your session has ended. Sign in again, then try again.')
        }
        userId = user.id
    } else {
        // getUser() verifies the session with Supabase; getSession() trusted the cookie as is.
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user?.id) {
            return checkoutFailed(request, 401, 'Your session has ended. Sign in again, then try again.')
        }
        userId = user.id
    }

    // Starting a checkout changes the whole billing group's subscription: firm admins only (the
    // same rule as cancel and the customer portal). Any member — guests included — could before.
    // (.claude/plans/access-gates.md, P0 #11)
    const membership = await prisma.firmMember.findFirst({
        where: {
            firmId,
            userId,
            role: 'firm_admin',
            firm: { deletedAt: null },
        },
        select: { id: true },
    })
    if (!membership) {
        return checkoutFailed(request, 403, 'Only a firm admin can change the plan. Ask an admin for access.')
    }

    const explicitProducts = reqUrl.searchParams
        .getAll('products')
        .map((s) => s.trim())
        .filter(Boolean)
    const fallbackProductIds =
        process.env.POLAR_DEFAULT_CHECKOUT_PRODUCT_IDS?.split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean) ?? []
    const productIds = explicitProducts.length > 0 ? explicitProducts : fallbackProductIds
    if (productIds.length === 0) {
        return checkoutFailed(request, 400, 'No plan was chosen for this checkout. Pick a plan, then try again.')
    }
    // Caller-chosen products must be in the public, non-archived catalog — no hidden or archived
    // product ids. (The env fallback is server configuration and needs no check.)
    if (explicitProducts.length > 0) {
        let catalogIds: Set<string>
        try {
            catalogIds = new Set((await fetchBillingCatalogPlans()).map((p) => p.id))
        } catch (e) {
            logger.error('Checkout: plan catalog failed to load', e instanceof Error ? e : new Error(String(e)), 'billing')
            return checkoutFailed(request, 502, "Couldn't load plans. Try again in a minute.")
        }
        if (explicitProducts.some((pid) => !catalogIds.has(pid))) {
            return checkoutFailed(request, 400, "That plan isn't offered anymore. Refresh Billing and pick a plan again.")
        }
    }

    // Rebuild the query from scratch: everything else the Polar helper reads (customerExternalId,
    // metadata, customerId, customerEmail, discountId, seats…) used to pass straight through, so a
    // checkout could be pointed at another billing group and replace its subscription. The customer
    // and metadata are always this firm's group, set here.
    const returnToRaw = reqUrl.searchParams.get('returnTo')
    const groupId = await resolveGroupId(firmId)
    for (const key of Array.from(new Set(reqUrl.searchParams.keys()))) {
        reqUrl.searchParams.delete(key)
    }
    reqUrl.searchParams.set('firmId', firmId)
    for (const pid of productIds) {
        reqUrl.searchParams.append('products', pid)
    }
    reqUrl.searchParams.set('customerExternalId', groupId)
    reqUrl.searchParams.set('metadata', JSON.stringify({ groupId }))

    const returnTo = validateCheckoutReturnTo(returnToRaw)
    let successUrl = successUrlEnv.trim()
    try {
        const success = new URL(successUrl)
        if (returnTo) {
            success.searchParams.set('returnTo', returnTo)
        }
        successUrl = success.toString()
    } catch {
        logger.error(
            'Checkout: POLAR_SUCCESS_URL must be an absolute URL (e.g. https://app.example.com/checkout/success)',
            new Error('POLAR_SUCCESS_URL is not an absolute URL'),
            'billing'
        )
        return checkoutFailed(request, 500, "Checkout isn't set up on this server yet.")
    }

    const checkout = Checkout({
        accessToken: accessToken.trim(),
        successUrl,
        server: polarServer(),
    })

    const proxiedRequest = new NextRequest(reqUrl.toString(), { headers: request.headers })
    let res: Response
    try {
        res = await checkout(proxiedRequest)
    } catch (e) {
        logger.error('Checkout: Polar checkout threw', e instanceof Error ? e : new Error(String(e)), 'billing', { firmId })
        return checkoutFailed(request, 502, "Polar, our payment provider, couldn't open the checkout. Try again in a minute.")
    }
    // The Polar helper logs Polar's refusal itself and answers `Response.error()` (type "error",
    // status 0) with no words of its own.
    if (res.type === 'error' || res.status === 0 || res.status >= 400) {
        logger.error('Checkout: Polar refused to create a checkout', new Error(`Polar checkout answered ${res.status}`), 'billing', {
            firmId,
            products: productIds,
        })
        return checkoutFailed(request, 502, "Polar, our payment provider, couldn't open the checkout. Try again in a minute.")
    }
    return res
}

export async function GET(request: NextRequest) {
    return checkoutHandler(request)
}
