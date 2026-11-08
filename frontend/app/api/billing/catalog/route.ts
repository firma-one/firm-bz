import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchBillingCatalogPlans } from '@/lib/billing/polar-catalog'
import { logger } from '@/lib/logger'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const items = await fetchBillingCatalogPlans()
        return NextResponse.json({ items })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Catalog fetch failed'
        const isConfig = message.includes('POLAR_ACCESS_TOKEN')
        // The raw text is for the logs: it can be provider or configuration detail.
        logger.error('Billing catalog failed to load', e instanceof Error ? e : new Error(message), 'billing', { isConfig })
        return NextResponse.json(
            {
                error: isConfig ? "Plans aren't set up on this server yet." : 'Polar, our payment provider, didn\'t answer. Try again in a minute.',
                items: [] as const,
            },
            { status: isConfig ? 503 : 502 }
        )
    }
}
