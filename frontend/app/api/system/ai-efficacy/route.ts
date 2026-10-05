import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { getAiEfficacyReport } from '@/lib/ai/feedback'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/ai-efficacy?days=30&firmId=<uuid>
 *
 * Thumbs up/down rates across all firms, for the system admin tools. Answers one question: is Brio
 * getting better or worse, and what is it bad at. `firmId` narrows every section to one account.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!(await isSysAdminUser(user.id))) {
            return NextResponse.json({ error: 'Forbidden: System admin access required' }, { status: 403 })
        }

        const raw = Number(request.nextUrl.searchParams.get('days') ?? 30)
        // Clamped rather than rejected: a nonsense window should show a sensible report, not a 400.
        const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.trunc(raw))) : 30

        // Shape-checked so a malformed value cannot reach a uuid column and throw mid-query.
        const firmParam = request.nextUrl.searchParams.get('firmId')?.trim()
        const firmId = firmParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firmParam)
            ? firmParam
            : undefined

        return NextResponse.json({ data: await getAiEfficacyReport(days, firmId) })
    } catch (error) {
        logger.error('[system/ai-efficacy] GET failed:', error as Error)
        return NextResponse.json({ error: 'Could not load AI efficacy' }, { status: 500 })
    }
}
