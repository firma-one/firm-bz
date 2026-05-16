import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from "@/lib/google-drive-connector"
import { config } from '@/lib/config'

const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey!
)

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const fileId = searchParams.get('fileId')
        const connectorId = searchParams.get('connectorId')

        if (!fileId || !connectorId) {
            return NextResponse.json({ error: 'Missing fileId or connectorId' }, { status: 400 })
        }

        const fileIdPattern = /^[A-Za-z0-9_-]+$/
        if (!fileIdPattern.test(fileId)) {
            return NextResponse.json({ error: 'Invalid fileId format' }, { status: 400 })
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

        if (connector && connector.userId !== user.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        if (!connector) {
            return NextResponse.json({ error: 'Connector not found or access denied' }, { status: 403 })
        }

        // Fetch Revisions
        try {
            const revisions = await googleDriveConnector.getRevisions(connectorId, fileId)
            return NextResponse.json({ revisions })
        } catch (error) {
            console.error('[API] Failed to fetch revisions:', error)
            return NextResponse.json({ error: 'Failed to fetch revisions' }, { status: 500 })
        }

    } catch (error) {
        console.error('Versions API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
