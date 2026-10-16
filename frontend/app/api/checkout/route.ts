import { Checkout } from '@polar-sh/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { polarServer } from '@/lib/billing/polar-client'
import { fetchBillingCatalogPlans } from '@/lib/billing/polar-catalog'

async function checkoutHandler(request: NextRequest) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN
    const successUrlEnv = process.env.POLAR_SUCCESS_URL
    if (!accessToken?.trim() || !successUrlEnv?.trim()) {
        return NextResponse.json(
            { error: 'Polar checkout is not configured (set POLAR_ACCESS_TOKEN and POLAR_SUCCESS_URL).' },
            { status: 503 }
        )
    }

    const reqUrl = new URL(request.url)
    const firmId = reqUrl.searchParams.get('firmId')?.trim()
    if (!firmId) {
        return NextResponse.json({ error: 'Missing required query param: firmId' }, { status: 400 })
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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        userId = user.id
    } else {
        // getUser() verifies the session with Supabase; getSession() trusted the cookie as is.
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        return NextResponse.json({ error: 'Forbidden: only firm admins can start a checkout' }, { status: 403 })
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
        return NextResponse.json(
            {
                error:
                    'Missing products in query params. Pass one or more `products` UUIDs, or set POLAR_DEFAULT_CHECKOUT_PRODUCT_IDS.',
            },
            { status: 400 }
        )
    }
    // Caller-chosen products must be in the public, non-archived catalog — no hidden or archived
    // product ids. (The env fallback is server configuration and needs no check.)
    if (explicitProducts.length > 0) {
        const catalogIds = new Set((await fetchBillingCatalogPlans()).map((p) => p.id))
        if (explicitProducts.some((pid) => !catalogIds.has(pid))) {
            return NextResponse.json({ error: 'Unknown product' }, { status: 400 })
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
        return NextResponse.json(
            { error: 'POLAR_SUCCESS_URL must be an absolute URL (e.g. https://app.example.com/checkout/success).' },
            { status: 500 }
        )
    }

    const checkout = Checkout({
        accessToken: accessToken.trim(),
        successUrl,
        server: polarServer(),
    })

    const proxiedRequest = new NextRequest(reqUrl.toString(), { headers: request.headers })
    return checkout(proxiedRequest)
}

export async function GET(request: NextRequest) {
    return checkoutHandler(request)
}
