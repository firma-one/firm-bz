import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { resolveDefaultFirmLandingPath } from '@/lib/landing/default-landing-path'
import { BillingPageClient } from '@/components/billing/billing-page-client'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

type Props = {
    searchParams: Promise<{ from_checkout?: string }>
}

export default async function BillingPage({ searchParams }: Props) {
    const sp = await searchParams
    const fromCheckout = sp.from_checkout === '1'

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (user?.id) {
        const path = await resolveDefaultFirmLandingPath(user.id)
        if (path === '/d/onboarding' && !fromCheckout) {
            redirect('/d/onboarding')
        }
    }
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[40vh] items-center justify-center gap-2 text-small text-fg-muted">
                    <LoadingSpinner size="sm" />
                    <span>Loading billing…</span>
                </div>
            }
        >
            <BillingPageClient />
        </Suspense>
    )
}
