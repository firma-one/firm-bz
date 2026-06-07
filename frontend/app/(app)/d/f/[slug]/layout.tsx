import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { checkFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'

// Deduplicate the firm lookup within a single request — checkFirmSubscriptionAccess
// also calls prisma internally, but this cached call collapses the slug→id round-trip.
const getFirmIdBySlug = cache(async (slug: string) => {
    return prisma.firm.findUnique({ where: { slug }, select: { id: true } })
})

/**
 * Hard lock: if the firm's subscription is revoked, redirect to the locked page.
 * Sandbox firms and firms with active subscriptions pass through immediately.
 * Fails open on DB errors to avoid false locks.
 * Skips the check when already on the subscription-locked page to prevent redirect loops.
 */
export default async function FirmSlugLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params

    // Avoid infinite redirect: if the current request IS the locked page, let it render.
    // proxy.ts sets x-invoke-path on every request — use that instead of middleware.
    const headersList = await headers()
    const pathname = headersList.get('x-invoke-path') ?? ''
    if (pathname.endsWith('/subscription-locked')) {
        return <>{children}</>
    }

    const firm = await getFirmIdBySlug(slug)

    if (firm) {
        const allowed = await checkFirmSubscriptionAccess(firm.id)
        if (!allowed) {
            redirect(`/d/f/${slug}/subscription-locked`)
        }
    }

    return <>{children}</>
}
