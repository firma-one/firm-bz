import { Checkout } from '@polar-sh/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'
import { resolveGroupId } from '@/lib/billing/billing-group'

function polarServer(): 'sandbox' | 'production' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

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
        const supabase = await createClient()
        const {
            data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        userId = session.user.id
    }

    const membership = await prisma.firmMember.findFirst({
        where: {
            firmId,
            userId,
            firm: { deletedAt: null },
        },
        select: { id: true },
    })
    if (!membership) {
        return NextResponse.json({ error: 'Forbidden: user is not a member of firm' }, { status: 403 })
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
    reqUrl.searchParams.delete('products')
    for (const pid of productIds) {
        reqUrl.searchParams.append('products', pid)
    }

    if (!reqUrl.searchParams.get('customerExternalId')) {
        const groupId = await resolveGroupId(firmId)
        reqUrl.searchParams.set('customerExternalId', groupId)
    }

    if (!reqUrl.searchParams.get('metadata')) {
        const groupId = await resolveGroupId(firmId)
        reqUrl.searchParams.set('metadata', JSON.stringify({ groupId }))
    }

    const returnToRaw = reqUrl.searchParams.get('returnTo')
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
