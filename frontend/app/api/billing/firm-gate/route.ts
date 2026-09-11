import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getFirmCreationGateReason, getFirmCreationGateReasonForGroup } from '@/lib/billing/firm-creation-gate'

export async function GET(request: Request) {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // groupSlug is passed whenever the caller has a specific group in context (e.g. the
    // "Add Firm" button on /d/[groupSlug]/f) — the unscoped check would misleadingly report
    // "allowed" if the user has room in some OTHER, unrelated group.
    const groupSlug = new URL(request.url).searchParams.get('groupSlug')
    const result = groupSlug
        ? await getFirmCreationGateReasonForGroup(user.id, groupSlug)
        : await getFirmCreationGateReason(user.id)
    const allowed = result.reason === 'allowed'
    return NextResponse.json({
        allowed,
        reason: result.reason,
        cap: result.cap,
    })
}
