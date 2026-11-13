import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { isAiConfigured } from '@/lib/ai/client'
import { aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_DATA_UNREADABLE, BRIO_DAY_FAILED } from '@/lib/ai/brio-failure'
import {
    buildDayBriefInput,
    clearDayBriefCache,
    dayBriefTimezone,
    fingerprintDayBrief,
    generateDayBrief,
    isDayBriefEmpty,
    loadDayBriefCache,
    loadDayBriefSources,
    localDay,
    saveDayBriefCache,
    type DayBriefCache,
} from '@/lib/ai/day-brief'

/*
 * "Your day" on Home (.claude/plans/brio-features-round-2.md, §3.2), for the signed-in person only:
 * the user comes from the Supabase session, never from the request.
 *
 * GET   today's brief. Served from UserPersonalization.dayBrief when it was written for today (in
 *       the person's timezone); written when the day has changed since, so at most once a day.
 * POST  Rewrite. Writes a new one only when what a person changed has changed since today's
 *       (fingerprintDayBrief); otherwise answers today's with `unchanged: true` and no model call.
 *
 * Either way, nothing waiting, overdue or on this week's calendar means no brief and no model call:
 * `empty: true`.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export type DayBriefShown = { text: string; date: string; generatedAt: string }

export type DayBriefResponse = {
    brief: DayBriefShown | null
    /** Nothing to brief: no Needs you items, nothing overdue, nothing this week. */
    empty?: boolean
    /** Rewrite found nothing changed since this brief was written. */
    unchanged?: boolean
    /** No model configured: Home leaves the card out. */
    available?: false
}

const answer = (body: DayBriefResponse) => NextResponse.json(body)

/** What the card needs; the fingerprint stays on the server. */
const shown = (b: DayBriefCache): DayBriefShown => ({ text: b.text, date: b.date, generatedAt: b.generatedAt })

async function sessionUserId(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
}

/**
 * Loads the person's day and writes its brief, unless `todays` (the brief already written today)
 * was written from the same items.
 */
async function write(userId: string, timezone: string, now: Date, todays: DayBriefCache | null): Promise<Response> {
    let sources
    try {
        sources = await loadDayBriefSources(userId, now)
    } catch (error) {
        // Not written from part of the day: a brief missing what didn't load would be cached for all of it.
        logger.error('Day brief: Home data failed to load', error as Error)
        return NextResponse.json({ error: BRIO_DATA_UNREADABLE }, { status: 502 })
    }

    const input = buildDayBriefInput(sources, { timezone, now })
    const fingerprint = fingerprintDayBrief(input)
    if (todays && todays.fingerprint === fingerprint) return answer({ brief: shown(todays), unchanged: true })

    if (isDayBriefEmpty(input)) {
        // Everything in today's brief has been dealt with: it would describe a day that's over.
        if (todays) await clearDayBriefCache(userId)
        return answer({ brief: null, empty: true })
    }

    const result = await generateDayBrief(input, { userId })
    if (!result.ok) {
        if (result.reason === 'unconfigured') return answer({ brief: null, available: false })
        logger.warn('Day brief: the model returned no brief (declined, cut off or empty)')
        return NextResponse.json({ error: BRIO_DAY_FAILED }, { status: 500 })
    }

    const saved = await saveDayBriefCache(userId, {
        date: input.today,
        text: result.text,
        fingerprint,
        generatedAt: new Date().toISOString(),
    })
    return answer({ brief: shown(saved) })
}

export async function GET() {
    const userId = await sessionUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAiConfigured()) return answer({ brief: null, available: false })

    try {
        const now = new Date()
        const [timezone, cached] = await Promise.all([dayBriefTimezone(userId), loadDayBriefCache(userId)])
        if (cached && cached.date === localDay(now, timezone)) return answer({ brief: shown(cached) })
        // A new day (or the first): written once, then served from the cache until tomorrow.
        return await write(userId, timezone, now, null)
    } catch (error) {
        return aiFailureResponse(error, BRIO_DAY_FAILED, 'Day brief (GET) failed:')
    }
}

export async function POST() {
    const userId = await sessionUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAiConfigured()) return answer({ brief: null, available: false })

    try {
        const now = new Date()
        const [timezone, cached] = await Promise.all([dayBriefTimezone(userId), loadDayBriefCache(userId)])
        const todays = cached && cached.date === localDay(now, timezone) ? cached : null
        return await write(userId, timezone, now, todays)
    } catch (error) {
        return aiFailureResponse(error, BRIO_DAY_FAILED, 'Day brief (POST) failed:')
    }
}
