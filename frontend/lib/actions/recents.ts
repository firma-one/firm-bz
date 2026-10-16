'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { MAX_RECENTS_PER_USER, parseAppPath } from '@/lib/recents'

/**
 * Writes server-side recents for the New UI (.claude/plans/ui-ux-overhaul.md, Phase 3). Called
 * only by the v2 shell, so v1 users' behavior is unchanged.
 *
 * A visit is recorded only for an entity the caller can see right now — the same membership rule
 * as getFirmHierarchy — so a guessed or stale URL never plants a row. Reads re-check anyway.
 */

type Entity = { type: 'firm' | 'client' | 'engagement'; id: string; firmId: string; title: string }

async function resolveVisibleEntity(userId: string, path: string): Promise<Entity | null> {
    const parsed = parseAppPath(path)
    if (!parsed) return null

    const firm = await prisma.firm.findUnique({
        where: { slug: parsed.firmSlug },
        select: { id: true, name: true, group: { select: { slug: true } } },
    })
    if (!firm || firm.group.slug !== parsed.groupSlug) return null

    const member = await prisma.firmMember.findFirst({ where: { userId, firmId: firm.id }, select: { id: true } })
    if (!member) return null

    if (parsed.engagementSlug && parsed.clientSlug) {
        const e = await prisma.engagement.findFirst({
            where: {
                slug: parsed.engagementSlug,
                isDeleted: false,
                client: { slug: parsed.clientSlug, firmId: firm.id },
                members: { some: { userId } },
            },
            select: { id: true, name: true },
        })
        return e ? { type: 'engagement', id: e.id, firmId: firm.id, title: e.name } : null
    }

    if (parsed.clientSlug) {
        const c = await prisma.client.findFirst({
            where: {
                firmId: firm.id,
                slug: parsed.clientSlug,
                OR: [
                    { members: { some: { userId } } },
                    { engagements: { some: { isDeleted: false, members: { some: { userId } } } } },
                ],
            },
            select: { id: true, name: true },
        })
        return c ? { type: 'client', id: c.id, firmId: firm.id, title: c.name } : null
    }

    return { type: 'firm', id: firm.id, firmId: firm.id, title: firm.name }
}

function cleanPath(path: string): string {
    // `landed` only drives the one-time arrival overlay; never replay it.
    return path.replace(/([?&])landed=[^&#]*&?/, '$1').replace(/[?&](#|$)/, '$1')
}

async function prune(userId: string): Promise<void> {
    await prisma.$executeRaw`
        DELETE FROM platform.user_recent_visits
        WHERE "userId" = ${userId}::uuid
          AND id NOT IN (
              SELECT id FROM platform.user_recent_visits
              WHERE "userId" = ${userId}::uuid
              ORDER BY "visitedAt" DESC
              LIMIT ${MAX_RECENTS_PER_USER}
          )
    `
}

async function currentUserId(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
}

/** Records that the caller is on `path` right now. Never throws. */
export async function recordVisit(path: string): Promise<void> {
    try {
        if (typeof path !== 'string' || path.length > 2048 || !path.startsWith('/d/')) return
        const userId = await currentUserId()
        if (!userId) return
        const entity = await resolveVisibleEntity(userId, path)
        if (!entity) return

        const clean = cleanPath(path)
        await prisma.userRecentVisit.upsert({
            where: { userId_entityType_entityId: { userId, entityType: entity.type, entityId: entity.id } },
            create: { userId, firmId: entity.firmId, entityType: entity.type, entityId: entity.id, path: clean, title: entity.title },
            update: { firmId: entity.firmId, path: clean, title: entity.title, visitedAt: new Date() },
        })
        await prune(userId)
    } catch (e) {
        logger.error('recordVisit failed', e as Error, 'Recents')
    }
}

/**
 * One-time import of the legacy per-device recents (localStorage `fm_nav_recents_*`) on a user's
 * first New UI load, so Home is not empty on day one. Each item goes through the same visibility
 * check as a live visit; an existing newer row is never overwritten by an older import.
 */
export async function importLegacyRecents(items: { href: string; visitedAt: string }[]): Promise<void> {
    try {
        if (!Array.isArray(items)) return
        const userId = await currentUserId()
        if (!userId) return

        for (const item of items.slice(0, 30)) {
            if (typeof item?.href !== 'string' || !item.href.startsWith('/d/')) continue
            const at = new Date(item.visitedAt)
            if (Number.isNaN(at.getTime()) || at.getTime() > Date.now()) continue
            const entity = await resolveVisibleEntity(userId, item.href)
            if (!entity) continue

            const key = { userId_entityType_entityId: { userId, entityType: entity.type, entityId: entity.id } }
            const existing = await prisma.userRecentVisit.findUnique({ where: key, select: { visitedAt: true } })
            if (existing && existing.visitedAt >= at) continue
            await prisma.userRecentVisit.upsert({
                where: key,
                create: { userId, firmId: entity.firmId, entityType: entity.type, entityId: entity.id, path: cleanPath(item.href), title: entity.title, visitedAt: at },
                update: { path: cleanPath(item.href), title: entity.title, visitedAt: at },
            })
        }
        await prune(userId)
    } catch (e) {
        logger.error('importLegacyRecents failed', e as Error, 'Recents')
    }
}
