import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { buildUserDataMap, isSysAdminUser } from '@/lib/system/user-data-map'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allowed = await isSysAdminUser(user.id)
    if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const identifier = request.nextUrl.searchParams.get('identifier')?.trim() ?? ''
    if (!identifier) {
        return NextResponse.json({ error: 'Missing identifier (email or UUID)' }, { status: 400 })
    }

    const data = await buildUserDataMap(identifier)
    if (!data) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
}
