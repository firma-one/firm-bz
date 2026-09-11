import { redirect, notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { checkFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { firmPath } from '@/lib/navigation/firm-paths'

// Deduplicate the firm+group lookup within a single request — checkFirmSubscriptionAccess
// also calls prisma internally, but this cached call collapses the slug→id round-trip.
// Also resolves the firm's actual group slug so we can confirm it matches the URL's
// [groupSlug] segment — the group segment is real routing state now, not decorative.
const getFirmByFirmSlug = cache(async (firmSlug: string) => {
    return prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true, group: { select: { slug: true } } },
    })
})

/**
 * Hard lock: if the firm's subscription is revoked, redirect to the locked page.
 * Sandbox firms and firms with active subscriptions pass through immediately.
 * Fails open on DB errors to avoid false locks.
 * Skips the check when already on the subscription-locked page to prevent redirect loops.
 *
 * Also validates that the URL's [groupSlug] segment actually matches this firm's group —
 * firm slugs are globally unique, so mismatched group segments never occur through normal
 * navigation, but a hand-edited URL with the wrong group slug should 404, not silently work.
 */
export default async function FirmSlugLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ groupSlug: string; firmSlug: string }>
}) {
    const { groupSlug, firmSlug } = await params

    // Avoid infinite redirect: if the current request IS the locked page, let it render.
    // Use x-url (set by Next.js on every request) with x-invoke-path as dev fallback.
    const headersList = await headers()
    const rawUrl = headersList.get('x-url') ?? headersList.get('x-invoke-path') ?? ''
    const urlPathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl
    const isLockedPage = urlPathname.endsWith('/subscription-locked')

    const firm = await getFirmByFirmSlug(firmSlug)

    if (firm && firm.group.slug !== groupSlug) {
        notFound()
    }

    if (isLockedPage) {
        return <>{children}</>
    }

    if (firm) {
        const allowed = await checkFirmSubscriptionAccess(firm.id)
        if (!allowed) {
            redirect(`${firmPath(groupSlug, firmSlug)}/subscription-locked`)
        }
    }

    return <>{children}</>
}
