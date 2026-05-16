import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'

const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey!
)

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')
    const connectorId = searchParams.get('connectorId')

    if (!fileId || !connectorId) {
        return NextResponse.json({ error: 'Missing fileId or connectorId' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const connector = await prisma.connector.findUnique({
        where: { id: connectorId }
    })

    if (!connector || connector.userId !== user.id) {
        return NextResponse.json({ error: 'Connector not found or access denied' }, { status: 403 })
    }

    try {
        const activities = await googleDriveConnector.getActivity(connectorId, fileId)
        return NextResponse.json({ activities })
    } catch (error: any) {
        console.error('Failed to fetch activity:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to fetch activity' },
            { status: 500 }
        )
    }
}
