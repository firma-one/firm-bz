import 'server-only'

import { prisma } from '@/lib/prisma'
import { normalizeHost } from '@/lib/custom-domains/hosts'

/**
 * Where a storage-connect popup posts its result. The Google Drive and OneDrive OAuth callbacks always run on
 * the main address (their registered redirect URIs), but the page that opened the popup may be on a
 * workspace's custom domain, and a window only receives messages posted to its own origin. The opener sends
 * its origin in the OAuth state (`openerOrigin`); this accepts it only when it is an approved custom domain,
 * so a result is never posted to a site that isn't Firma. Anything else keeps the callback's own origin.
 */
export async function popupTargetOrigin(openerOrigin: string | null | undefined): Promise<string | null> {
    if (!openerOrigin) return null
    let url: URL
    try {
        url = new URL(openerOrigin)
    } catch {
        return null
    }
    if (url.protocol !== 'https:') return null
    const row = await prisma.groupDomain.findFirst({ where: { host: normalizeHost(url.host), status: 'APPROVED' }, select: { id: true } }).catch(() => null)
    return row ? url.origin : null
}
