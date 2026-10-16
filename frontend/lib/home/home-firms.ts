import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { checkFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { firmPath } from '@/lib/navigation/firm-paths'

/**
 * The firms the cross-firm Home and Inbox (`/d/u/home`, `/d/u/inbox`) draw from
 * (.claude/plans/cross-firm-home-inbox.md).
 *
 * Only firms the caller has a FirmMember row in. A firm whose own pages are closed right now — its
 * subscription is locked (the firm layout's gate) or it is in maintenance (the proxy's gate) — is
 * reported as unavailable instead, so Home never surfaces content the firm's pages would refuse.
 * The pages call this with the user they read themselves; it is not a server action.
 */

export type HomeFirm = { id: string; name: string; slug: string; groupSlug: string }

export type UnavailableFirm = HomeFirm & {
    reason: 'subscription' | 'maintenance'
    /** The firm's own lock or maintenance page, which explains what to do. */
    href: string
}

export type HomeFirms = { firms: HomeFirm[]; unavailable: UnavailableFirm[] }

/** Whether a firm's maintenance window is open: the same test /api/firm/maintenance-by-slug applies. */
export function maintenanceActive(settings: unknown, now = new Date()): boolean {
    const mode = (settings as { maintenanceMode?: { active?: boolean; expiresAt?: string } | null } | null)?.maintenanceMode
    if (!mode?.active) return false
    return !(mode.expiresAt && now > new Date(mode.expiresAt))
}

export async function getHomeFirms(userId: string): Promise<HomeFirms> {
    try {
        const rows = await prisma.firmMember.findMany({
            where: { userId, firm: { deletedAt: null, sandboxOnly: false } },
            select: { firm: { select: { id: true, name: true, slug: true, settings: true, group: { select: { slug: true } } } } },
        })

        const firms: HomeFirm[] = []
        const unavailable: UnavailableFirm[] = []
        await Promise.all(
            rows.map(async ({ firm }) => {
                const home: HomeFirm = { id: firm.id, name: firm.name, slug: firm.slug, groupSlug: firm.group.slug }
                const base = firmPath(home.groupSlug, home.slug)
                if (maintenanceActive(firm.settings)) {
                    unavailable.push({ ...home, reason: 'maintenance', href: `${base}/maintenance` })
                } else if (!(await checkFirmSubscriptionAccess(firm.id))) {
                    unavailable.push({ ...home, reason: 'subscription', href: `${base}/subscription-locked` })
                } else {
                    firms.push(home)
                }
            })
        )
        const byName = (a: HomeFirm, b: HomeFirm) => a.name.localeCompare(b.name)
        return { firms: firms.sort(byName), unavailable: unavailable.sort(byName) }
    } catch (e) {
        logger.error('getHomeFirms failed', e as Error, 'Home', { userId })
        return { firms: [], unavailable: [] }
    }
}
