import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getFirmCreationGateReason } from '@/lib/billing/firm-creation-gate'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await getFirmCreationGateReason(user.id)
    const allowed = result.reason === 'allowed'
    return NextResponse.json({
        allowed,
        reason: result.reason,
        cap: result.cap,
    })
}
