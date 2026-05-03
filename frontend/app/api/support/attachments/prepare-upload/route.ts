import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ConnectorType } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getStorageAdapter } from '@/lib/connectors/registry'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'

const ASSETS_FOLDER = 'assets'
const SUPPORT_FOLDER = 'support'

export async function POST(request: NextRequest) {
  try {
    // Auth: Bearer token from Supabase
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
    )

    // Get user from the JWT token
    const {
      data: { user },
    } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { firmSlug, ticketNumber, fileName, mimeType } = await request.json()
    if (!firmSlug || !ticketNumber || !fileName || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: firmSlug, ticketNumber, fileName, mimeType' },
        { status: 400 }
      )
    }

    // Resolve firm and connector
    const firm = await prisma.firm.findUnique({
      where: { slug: firmSlug },
      select: {
        id: true,
        settings: true,
        firmFolderId: true,
        connectorId: true,
      },
    })

    if (!firm) {
      return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
    }

    if (!firm.connectorId) {
      return NextResponse.json(
        { error: 'Firm has no Google Drive connector configured' },
        { status: 400 }
      )
    }

    const connector = await prisma.connector.findUnique({
      where: { id: firm.connectorId },
      select: { id: true, type: true, status: true },
    })

    if (!connector || connector.type !== ConnectorType.GOOGLE_DRIVE || connector.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Firm Google Drive connector is not active' },
        { status: 400 }
      )
    }

    // Resolve firm folder ID (same logic as logo route)
    const settings = (firm.settings as Record<string, unknown>) ?? {}
    const orgSettings =
      (settings.organizations as Record<string, Record<string, unknown>> | undefined)?.[firm.id] ?? {}
    const firmFolderId =
      (firm.firmFolderId as string | null) ??
      (orgSettings.orgFolderId as string | undefined) ??
      (settings.orgFolderId as string | undefined)

    if (!firmFolderId) {
      return NextResponse.json({ error: 'Firm folder not configured' }, { status: 400 })
    }

    // Build folder hierarchy: .meta → assets → support → <ticketNumber>
    const adapter = await getStorageAdapter(connector.id)
    const metaId = await adapter.findOrCreateFolder(connector.id, firmFolderId, METADATA_FOLDER_NAME)
    const assetsId = await adapter.findOrCreateFolder(connector.id, metaId, ASSETS_FOLDER)
    const supportId = await adapter.findOrCreateFolder(connector.id, assetsId, SUPPORT_FOLDER)
    const ticketFolderId = await adapter.findOrCreateFolder(connector.id, supportId, ticketNumber)

    // Generate randomized filename
    const ext = fileName.includes('.') ? fileName.split('.').pop() : ''
    const storedName = `${randomBytes(6).toString('hex')}${ext ? '.' + ext : ''}`

    // Get resumable upload URL from Google Drive
    const accessToken = await googleDriveConnector.getAccessToken(connector.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to get Google Drive access token' },
        { status: 500 }
      )
    }

    const uploadUrl = await googleDriveConnector.getResumableUploadUrl(
      accessToken,
      {
        name: storedName,
        mimeType,
        parents: [ticketFolderId],
      }
    )

    return NextResponse.json({ uploadUrl, storedName })
  } catch (error) {
    console.error('Failed to prepare attachment upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to prepare upload' },
      { status: 500 }
    )
  }
}
