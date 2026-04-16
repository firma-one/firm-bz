import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cascadeDeletePlatformDataForFirmAdminUser } from '@/lib/system/cascade-delete-firm-admin-user'
import { isSysAdminUser } from '@/lib/system/user-data-map'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeUuid(value: string): string {
    return value.trim().toLowerCase()
}

export async function POST(request: NextRequest) {
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

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const targetUserId = typeof (body as { targetUserId?: unknown }).targetUserId === 'string' ? (body as { targetUserId: string }).targetUserId : ''
    const confirmUserId =
        typeof (body as { confirmUserId?: unknown }).confirmUserId === 'string' ? (body as { confirmUserId: string }).confirmUserId : ''

    if (!UUID_RE.test(targetUserId) || !UUID_RE.test(confirmUserId)) {
        return NextResponse.json({ error: 'targetUserId and confirmUserId must be valid UUIDs' }, { status: 400 })
    }

    if (normalizeUuid(targetUserId) !== normalizeUuid(confirmUserId)) {
        return NextResponse.json({ error: 'confirmUserId must exactly match targetUserId' }, { status: 400 })
    }

    const counts = await cascadeDeletePlatformDataForFirmAdminUser(normalizeUuid(targetUserId))

    return NextResponse.json(
        {
            data: {
                ...counts,
                noOp: counts.firmAdminFirmIds.length === 0,
            },
        },
        { headers: { 'Cache-Control': 'no-store' } },
    )
}
