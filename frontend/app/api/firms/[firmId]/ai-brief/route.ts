import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { isAiConfigured } from '@/lib/ai/client'
import { generateFirmBrief, isBriefFresh, type FirmBrief } from '@/lib/ai/firm-brief'
import type { FirmInsightsResponse } from '../insights/route'

async function authorize(request: NextRequest, firmId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    const firm = findFirmInPermissions(settings.permissions, firmId)
    if (!firm) return { error: NextResponse.json({ error: 'Firm not found' }, { status: 404 }) }
    if (!(firm.scopes?.firm ?? []).includes('can_manage')) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { error: null }
}

async function readCachedBrief(firmId: string): Promise<{ settings: Record<string, unknown>; brief: FirmBrief | null }> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const settings = (firm?.settings as Record<string, unknown>) ?? {}
    const brief = (settings.aiBrief as FirmBrief | undefined) ?? null
    return { settings, brief }
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
): Promise<FirmBrief | null> {
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

    const content = await generateFirmBrief(await insightsRes.json() as FirmInsightsResponse)
    if (!content) return null

    const brief: FirmBrief = { content, generatedAt: new Date().toISOString() }
    await prisma.firm.update({
        where: { id: firmId },
        data: { settings: { ...existingSettings, aiBrief: brief } as never },
    })
    return brief
}

/** Returns the cached brief when under an hour old, otherwise generates one. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
    try {
        const { firmId } = await params
        const auth = await authorize(request, firmId)
        if (auth.error) return auth.error

        if (!isAiConfigured()) return NextResponse.json({ brief: null, configured: false })

        const { settings, brief } = await readCachedBrief(firmId)
        if (isBriefFresh(brief)) return NextResponse.json({ brief, configured: true })

        const fresh = await regenerate(request, firmId, settings)
        // Fall back to the stale brief rather than showing nothing when generation fails.
        return NextResponse.json({ brief: fresh ?? brief, configured: true })
    } catch (error) {
        logger.error('AI brief GET error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/** Force-refresh, ignoring cache age. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
    try {
        const { firmId } = await params
        const auth = await authorize(request, firmId)
        if (auth.error) return auth.error

        if (!isAiConfigured()) return NextResponse.json({ brief: null, configured: false })

        const { settings } = await readCachedBrief(firmId)
        const fresh = await regenerate(request, firmId, settings)
        if (!fresh) return NextResponse.json({ error: 'Brief generation failed' }, { status: 502 })

        return NextResponse.json({ brief: fresh, configured: true })
    } catch (error) {
        logger.error('AI brief POST error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
