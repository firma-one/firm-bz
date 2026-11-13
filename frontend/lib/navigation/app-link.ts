import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { brandedHostForGroup } from '@/lib/custom-domains/group-domains'
import { platformLink } from '@/lib/navigation/platform-link'

/**
 * The one way to build an absolute link to a page in a workspace, for emails, invites and anything else
 * read outside the app (.claude/plans/branded-host-email-links.md). It uses the workspace's approved,
 * reachable custom domain, so someone who works on acme.firma.bz lands there signed in, and falls back
 * to NEXT_PUBLIC_APP_URL. In the app itself links stay paths; never store what this returns.
 *
 * `scope` names whatever the link is about; the Group is found from it. A lookup that fails never
 * fails the email: the link falls back to the main address.
 */
export type LinkScope = { groupId: string } | { firmId: string } | { engagementId: string } | { documentId: string }

async function groupIdOf(scope: LinkScope): Promise<string | null> {
    if ('groupId' in scope) return scope.groupId
    if ('firmId' in scope) {
        const firm = await prisma.firm.findUnique({ where: { id: scope.firmId }, select: { groupId: true } })
        return firm?.groupId ?? null
    }
    if ('engagementId' in scope) {
        const eng = await prisma.engagement.findUnique({ where: { id: scope.engagementId }, select: { firm: { select: { groupId: true } } } })
        return eng?.firm?.groupId ?? null
    }
    const doc = await prisma.engagementDocument.findUnique({ where: { id: scope.documentId }, select: { firm: { select: { groupId: true } } } })
    return doc?.firm?.groupId ?? null
}

export async function appLink(path: string, scope: LinkScope | null | undefined): Promise<string> {
    if (!scope) return platformLink(path)
    try {
        const groupId = await groupIdOf(scope)
        const host = groupId ? await brandedHostForGroup(groupId) : null
        return host ? `https://${host}${path}` : platformLink(path)
    } catch (e) {
        logger.warn('appLink fell back to the main address', 'CustomDomains', { error: String(e) })
        return platformLink(path)
    }
}

/** appLink for a path that may be missing (a notification without a page). */
export async function appLinkOrNull(path: string | null | undefined, scope: LinkScope | null | undefined): Promise<string | null> {
    return path ? appLink(path, scope) : null
}
