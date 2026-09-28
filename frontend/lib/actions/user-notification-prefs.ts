'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'

// ─── Stored shape ────────────────────────────────────────────────────────────

export type UserNotificationPrefs = {
    /** IANA timezone, captured silently from the browser. Drives local-09:00 digest delivery. */
    timezone: string
    remindersDigest: {
        /** "YYYY-MM-DD" in the user's own timezone — the once-per-day claim stamp. */
        lastNotifiedDate: string | null
    }
}

const DEFAULTS: UserNotificationPrefs = {
    timezone: 'UTC',
    remindersDigest: { lastNotifiedDate: null },
}

function normalize(raw: unknown): UserNotificationPrefs {
    const r = (raw ?? {}) as Record<string, any>
    return {
        timezone: typeof r.timezone === 'string' && r.timezone ? r.timezone : DEFAULTS.timezone,
        remindersDigest: {
            lastNotifiedDate: typeof r.remindersDigest?.lastNotifiedDate === 'string'
                ? r.remindersDigest.lastNotifiedDate
                : null,
        },
    }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getUserNotificationPrefs(userId: string): Promise<UserNotificationPrefs> {
    const row = await prisma.userPersonalization.findUnique({
        where: { userId },
        select: { notificationPrefs: true },
    })
    return normalize(row?.notificationPrefs)
}

// ─── Timezone ────────────────────────────────────────────────────────────────

/** Valid IANA zone? Uses the runtime's own tz database rather than a hardcoded list. */
export async function isValidTimezone(tz: string): Promise<boolean> {
    if (!tz || typeof tz !== 'string' || tz.length > 64) return false
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
        return true
    } catch {
        return false
    }
}

/**
 * Stores the caller's browser timezone. No-op when unchanged, so the once-per-session
 * client ping is cheap. Never throws — a missing timezone only costs digest accuracy.
 */
export async function setUserTimezone(timezone: string): Promise<{ ok: boolean }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { ok: false }
        if (!(await isValidTimezone(timezone))) return { ok: false }

        const current = await getUserNotificationPrefs(user.id)
        if (current.timezone === timezone) return { ok: true }

        await prisma.userPersonalization.upsert({
            where: { userId: user.id },
            create: { userId: user.id, notificationPrefs: { ...current, timezone } as any },
            update: { notificationPrefs: { ...current, timezone } as any },
        })
        return { ok: true }
    } catch (e) {
        logger.error('setUserTimezone failed', e as Error, 'Notifications')
        return { ok: false }
    }
}

// ─── Daily digest claim ──────────────────────────────────────────────────────

/** "YYYY-MM-DD" as it reads in the given timezone right now. */
export async function localDateFor(timezone: string, at: Date = new Date()): Promise<string> {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(at)
    } catch {
        return at.toISOString().slice(0, 10)
    }
}

/** The local hour (0-23) in the given timezone right now. */
export async function localHourFor(timezone: string, at: Date = new Date()): Promise<number> {
    try {
        return Number(new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, hour: '2-digit', hour12: false,
        }).format(at))
    } catch {
        return at.getUTCHours()
    }
}

/**
 * Claims the once-per-day reminder digest for a user. Returns true to EXACTLY ONE caller
 * per local day — the hourly digest cron and the in-app sign-in catch-up both call it, and
 * only the winner notifies. Written as a single conditional UPDATE so the two cannot
 * interleave a read-modify-write and both fire.
 *
 * Never throws: a failed claim means no notification, which is strictly better than two.
 */
export async function claimDailyDigest(userId: string, localDate: string): Promise<boolean> {
    try {
        // NB: jsonb_set cannot create an intermediate object — with notificationPrefs = '{}'
        // it returns the input unchanged, so the guard below would never become true and
        // every call would "win". Merge instead, which builds remindersDigest when absent
        // while preserving timezone and any other keys.
        const affected = await prisma.$executeRaw`
            UPDATE platform.user_personalizations
            SET "notificationPrefs" =
                COALESCE("notificationPrefs", '{}'::jsonb)
                || jsonb_build_object(
                     'remindersDigest',
                     COALESCE("notificationPrefs" -> 'remindersDigest', '{}'::jsonb)
                       || jsonb_build_object('lastNotifiedDate', ${localDate}::text))
            WHERE "userId" = ${userId}::uuid
              AND COALESCE("notificationPrefs" #>> '{remindersDigest,lastNotifiedDate}', '') <> ${localDate}
        `
        return affected > 0
    } catch (e) {
        logger.error('claimDailyDigest failed', e as Error, 'Notifications', { userId })
        return false
    }
}
