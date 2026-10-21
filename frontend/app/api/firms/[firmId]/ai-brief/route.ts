import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { isAiConfigured } from '@/lib/ai/client'
import { briefFingerprint, generateFirmBrief, isBriefFresh, streamFirmBrief, type FirmBrief } from '@/lib/ai/firm-brief'
import { assertWithinAiCreditCap, AiCreditLimitError } from '@/lib/ai/credit-cap'
import { aiLimitResponse } from '@/lib/ai/guarded-client'
import type { FirmInsightsResponse } from '../insights/route'

async function authorize(request: NextRequest, firmId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: undefined }

    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    const firm = findFirmInPermissions(settings.permissions, firmId)
    if (!firm) return { error: NextResponse.json({ error: 'Firm not found' }, { status: 404 }), userId: undefined }
    if (!(firm.scopes?.firm ?? []).includes('can_manage')) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), userId: undefined }
    }
    // userId is returned so the caller can attribute AI usage to the person who triggered it.
    return { error: null, userId: user.id }
}

async function readCachedBrief(firmId: string): Promise<{ settings: Record<string, unknown>; brief: FirmBrief | null }> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const settings = (firm?.settings as Record<string, unknown>) ?? {}
    const brief = (settings.aiBrief as FirmBrief | undefined) ?? null
    return { settings, brief }
}

/** The firm's insights, as the brief is written from them; null when they can't be loaded. */
async function loadInsights(request: NextRequest, firmId: string): Promise<FirmInsightsResponse | null> {
    const insightsRes = await fetch(new URL(`/api/firms/${firmId}/insights`, request.url), {
        headers: {
            // The insights route authenticates from cookies; callers of this route may send a
            // Bearer token instead. Forward both so either path resolves the same user.
            cookie: request.headers.get('cookie') ?? '',
            ...(request.headers.get('authorization')
                ? { authorization: request.headers.get('authorization')! }
                : {}),
        },
    })
    if (!insightsRes.ok) {
        logger.error(`AI brief: insights fetch failed with ${insightsRes.status}`)
        return null
    }
    return await insightsRes.json() as FirmInsightsResponse
}

/**
 * The rewrite, streamed as NDJSON — `meta`, then a `delta` per piece of text, then `done` with the
 * saved brief (or `error`) — so the card shows Brio writing instead of a silent wait. The brief is
 * saved only once it is complete: stopping it (the client aborts) stops the model, saves nothing
 * and is not charged, and the brief on file stays as it was.
 */
async function streamRewrite(request: NextRequest, firmId: string, userId?: string): Promise<Response> {
    try {
        await assertWithinAiCreditCap({ firmId, feature: 'brief' })
    } catch (error) {
        const limited = aiLimitResponse(error)
        if (limited) return limited
        throw error
    }
    const insights = await loadInsights(request, firmId)
    if (!insights) return NextResponse.json({ error: 'Brief generation failed' }, { status: 502 })

    const encoder = new TextEncoder()
    const line = (o: unknown) => encoder.encode(JSON.stringify(o) + '\n')
    const abort = new AbortController()
    const generatedAt = new Date().toISOString()

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                controller.enqueue(line({ type: 'meta', generatedAt }))
                const content = await streamFirmBrief(insights, { firmId, userId }, (text) => {
                    if (!abort.signal.aborted) controller.enqueue(line({ type: 'delta', text }))
                }, abort.signal)
                if (abort.signal.aborted) return
                if (!content) {
                    controller.enqueue(line({ type: 'error', message: 'Brief generation failed' }))
                    return
                }
                // Settings read again here, not at the start: the stream takes seconds, and the
                // firm's settings may have changed meanwhile.
                const { settings } = await readCachedBrief(firmId)
                const brief: FirmBrief = { content, generatedAt, fingerprint: briefFingerprint(insights) }
                await prisma.firm.update({
                    where: { id: firmId },
                    data: { settings: { ...settings, aiBrief: brief } as never },
                })
                controller.enqueue(line({ type: 'done', brief }))
            } catch (error) {
                if (abort.signal.aborted) return
                logger.error('AI brief stream error:', error as Error)
                controller.enqueue(line({ type: 'error', message: 'Brief generation failed' }))
            } finally {
                try { controller.close() } catch { /* already closed by the client leaving */ }
            }
        },
        // The client stopped reading (Stop, or it left the page): stop the model too.
        cancel() {
            abort.abort()
        },
    })

    return new Response(body, {
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
    })
}

/**
 * Regenerates and persists. The insights payload is fetched over HTTP rather than by calling the
 * route handler directly — the handler reads auth from cookies, so it cannot be invoked as a
 * plain function. Forwarding the caller's cookies keeps the same permission scope.
 */
async function regenerate(
    request: NextRequest,
    firmId: string,
    existingSettings: Record<string, unknown>,
    userId?: string,
    /** Already loaded by the caller (GET compares them with the cached brief first). */
    loaded?: FirmInsightsResponse | null,
): Promise<FirmBrief | null> {
    // Gated here, not at the route entry: a cached brief serves without a model call, so reading
    // one must not consume credits. Returns null on breach, which callers already treat as
    // "no brief available" — the same path as an AI failure.
    try {
        await assertWithinAiCreditCap({ firmId, feature: 'brief' })
    } catch (error) {
        if (error instanceof AiCreditLimitError) {
            logger.info(`AI brief skipped for firm ${firmId}: ${error.kind} limit reached`)
            return null
        }
        throw error
    }

    const insights = loaded ?? await loadInsights(request, firmId)
    if (!insights) return null

    const content = await generateFirmBrief(insights, { firmId, userId })
    if (!content) return null

    const brief: FirmBrief = { content, generatedAt: new Date().toISOString(), fingerprint: briefFingerprint(insights) }
    await prisma.firm.update({
        where: { id: firmId },
        data: { settings: { ...existingSettings, aiBrief: brief } as never },
    })
    return brief
}

/**
 * Returns the cached brief when it's under an hour old and was written from the facts the
 * Overview's cards show now (briefFingerprint); otherwise writes a new one. The comparison needs
 * the firm's insights, read without a model call, so serving a cached brief still costs no credits.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
    try {
        const { firmId } = await params
        const auth = await authorize(request, firmId)
        if (auth.error) return auth.error

        if (!isAiConfigured()) return NextResponse.json({ brief: null, configured: false })

        const { settings, brief } = await readCachedBrief(firmId)
        const insights = isBriefFresh(brief) ? await loadInsights(request, firmId) : null
        // Without insights to compare (the fetch failed), an age-fresh brief is served as before.
        if (isBriefFresh(brief, insights ? briefFingerprint(insights) : undefined)) {
            return NextResponse.json({ brief, configured: true })
        }

        const fresh = await regenerate(request, firmId, settings, auth.userId, insights)
        // Fall back to the stale brief rather than showing nothing when generation fails.
        return NextResponse.json({ brief: fresh ?? brief, configured: true })
    } catch (error) {
        logger.error('AI brief GET error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/** Force-refresh, ignoring cache age. `?stream=1` streams it as it is written (Rewrite with Brio). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
    try {
        const { firmId } = await params
        const auth = await authorize(request, firmId)
        if (auth.error) return auth.error

        if (!isAiConfigured()) return NextResponse.json({ brief: null, configured: false })

        if (request.nextUrl.searchParams.get('stream') === '1') return await streamRewrite(request, firmId, auth.userId)

        const { settings } = await readCachedBrief(firmId)
        const fresh = await regenerate(request, firmId, settings, auth.userId)
        if (!fresh) return NextResponse.json({ error: 'Brief generation failed' }, { status: 502 })

        return NextResponse.json({ brief: fresh, configured: true })
    } catch (error) {
        logger.error('AI brief POST error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
