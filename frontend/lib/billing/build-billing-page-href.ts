import { validateCheckoutReturnTo } from '@/lib/billing/checkout-return-path'

/**
 * Client-safe link to `/d/billing` with firmSlug + returnTo for post-checkout / portal return.
 */
export function buildBillingPageHref(opts: {
    firmSlug: string | null | undefined
    groupSlug: string | null | undefined
    pathname: string | null | undefined
}): string {
    const slug = opts.firmSlug?.trim() || ''
    const groupSlug = opts.groupSlug?.trim() || ''
    const path = opts.pathname?.trim() || ''

    const params = new URLSearchParams()

    if (slug) {
        params.set('firmSlug', slug)
    }

    const fallback = slug && groupSlug ? `/d/${groupSlug}/f/${slug}` : '/d/u/profile'

    let returnTo: string
    if (path.startsWith('/d') && !path.startsWith('/d/billing')) {
        returnTo = validateCheckoutReturnTo(path) ?? fallback
    } else {
        returnTo = fallback
    }

    params.set('returnTo', validateCheckoutReturnTo(returnTo) ?? '/d/u/profile')

    return `/d/billing?${params.toString()}`
}
