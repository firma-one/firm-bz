import 'server-only'

import { prisma, basePrisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/utils/supabase/admin'
import { isPlatformHost, normalizeHost } from '@/lib/custom-domains/hosts'
import { brandedHostForGroupSlug, brandedHostsEnabled } from '@/lib/custom-domains/group-domains'

/**
 * The sign-in hand-off (.claude/plans/branded-host-email-links.md, "Option C"). Sign-in cookies belong to
 * one host, so after someone signs in on www and is about to land in a workspace with an approved custom
 * domain, the server carries the sign-in over instead of sending them there signed out:
 *
 * 1. `createHandoff` (on www): asks Supabase for a one-time magic-link token (no email is sent), keeps its
 *    hash in a SignInHandoff row that expires in 60 seconds, and answers
 *    `https://<domain>/auth/handoff?t=<row id>`. The token never appears in a URL, history or log.
 * 2. `/auth/handoff` (on the domain): `consumeHandoff` marks the row used, once, then the route verifies the
 *    token there, which sets that host's own session cookie, and opens the page.
 *
 * Best effort throughout: any failure returns null here, and the person simply stays on www, signed in.
 * Only from one of Firma's own hosts, never between two custom domains (no loops), only to a workspace the
 * person belongs to, and `next` is always a path.
 */

const TICKET_TTL_MS = 60_000

/** "/d/acme/f/acme-advisory/..." → "acme". Null for the picker, onboarding and other non-workspace paths. */
export function groupSlugOfPath(path: string): string | null {
    const m = /^\/d\/([^/?#]+)/.exec(path)
    if (!m) return null
    const slug = m[1]
    if (['onboarding', 'billing', 'profile', 'support', 'u'].includes(slug)) return null
    return decodeURIComponent(slug)
}

/** A relative path that stays on this site: "/d/…", never "//evil.com" or "https://…". */
export function isSafePath(path: string): boolean {
    return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
}

async function belongsToGroup(userId: string, groupId: string): Promise<boolean> {
    const [group, firm, engagement] = await Promise.all([
        prisma.groupMember.findFirst({ where: { userId, groupId }, select: { id: true } }),
        prisma.firmMember.findFirst({ where: { userId, firm: { groupId } }, select: { id: true } }),
        prisma.engagementMember.findFirst({ where: { userId, engagement: { firm: { groupId } } }, select: { id: true } }),
    ])
    return !!(group || firm || engagement)
}

/** The Supabase session id inside an access token (its `session_id` claim). */
export function sessionIdOfAccessToken(accessToken: string | null | undefined): string | null {
    if (!accessToken) return null
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { session_id?: string }
        return typeof payload.session_id === 'string' ? payload.session_id : null
    } catch {
        return null
    }
}

/**
 * Where a fresh sign-in should continue: `https://<domain>/auth/handoff?t=…` when the landing path is in a
 * workspace with an approved, reachable domain, else null (stay here).
 */
export async function createHandoff(p: {
    userId: string
    email: string | null | undefined
    currentHost: string | null
    nextPath: string
    originSessionId: string | null
}): Promise<string | null> {
    try {
        if (!brandedHostsEnabled() || !p.email || !p.currentHost) return null
        if (!isPlatformHost(p.currentHost) || !isSafePath(p.nextPath)) return null
        const slug = groupSlugOfPath(p.nextPath)
        if (!slug) return null
        const target = await brandedHostForGroupSlug(slug)
        if (!target || normalizeHost(target.host) === normalizeHost(p.currentHost)) return null
        if (!(await belongsToGroup(p.userId, target.groupId))) return null

        const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email: p.email })
        const tokenHash = data?.properties?.hashed_token
        if (error || !tokenHash) {
            logger.warn('Sign-in hand-off: generateLink failed', 'Auth', { error: error?.message })
            return null
        }
        const row = await prisma.signInHandoff.create({
            data: {
                userId: p.userId,
                host: target.host,
                nextPath: p.nextPath,
                tokenHash,
                originSessionId: p.originSessionId,
                expiresAt: new Date(Date.now() + TICKET_TTL_MS),
            },
            select: { id: true },
        })
        return `https://${target.host}/auth/handoff?t=${row.id}`
    } catch (e) {
        logger.warn('Sign-in hand-off skipped', 'Auth', { error: String(e) })
        return null
    }
}

/**
 * Uses a ticket on the host it was made for: once, within 60 seconds. Answers the token hash and the path
 * to open, and forgets the hash. Null when the ticket is unknown, used, expired or for another host.
 */
export async function consumeHandoff(ticketId: string, currentHost: string): Promise<{ id: string; tokenHash: string; nextPath: string; userId: string } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return null
    const rows = await basePrisma.$queryRaw<{ id: string; tokenHash: string | null; nextPath: string; userId: string }[]>`
        UPDATE platform.sign_in_handoffs
           SET "usedAt" = now()
         WHERE id = ${ticketId}::uuid AND "usedAt" IS NULL AND "expiresAt" > now() AND host = ${normalizeHost(currentHost)}
     RETURNING id::text AS id, "tokenHash", "nextPath", "userId"::text AS "userId"`
    const row = rows[0]
    if (!row?.tokenHash) return null
    await prisma.signInHandoff.update({ where: { id: row.id }, data: { tokenHash: null } })
    return { id: row.id, tokenHash: row.tokenHash, nextPath: isSafePath(row.nextPath) ? row.nextPath : '/d?entry=auth', userId: row.userId }
}

export async function recordTargetSession(ticketId: string, sessionId: string | null): Promise<void> {
    if (!sessionId) return
    await prisma.signInHandoff.update({ where: { id: ticketId }, data: { targetSessionId: sessionId } }).catch(() => undefined)
}

/**
 * Signing out on either host ends the other one's session too: the sessions a hand-off linked to this one.
 * Only this user's, and only sessions a hand-off created or started from. Returns how many ended.
 */
export async function endLinkedSessions(userId: string, sessionId: string): Promise<number> {
    const links = await prisma.signInHandoff.findMany({
        where: { userId, OR: [{ originSessionId: sessionId }, { targetSessionId: sessionId }] },
        select: { originSessionId: true, targetSessionId: true },
    })
    const ids = Array.from(new Set(links.flatMap((l) => [l.originSessionId, l.targetSessionId]).filter((x): x is string => !!x && x !== sessionId)))
    if (ids.length === 0) return 0
    return basePrisma.$executeRaw`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid AND id = ANY(${ids}::uuid[])`
}

/** createHandoff for the request being served (a Server Component): reads the user, host and session itself. */
export async function handoffForCurrentRequest(nextPath: string): Promise<string | null> {
    try {
        if (!brandedHostsEnabled()) return null
        const [{ headers }, { createClient }] = await Promise.all([import('next/headers'), import('@/utils/supabase/server')])
        const h = await headers()
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        const { data: { session } } = await supabase.auth.getSession()
        return createHandoff({
            userId: user.id,
            email: user.email,
            currentHost: h.get('x-forwarded-host') ?? h.get('host'),
            nextPath,
            originSessionId: sessionIdOfAccessToken(session?.access_token),
        })
    } catch {
        return null
    }
}
