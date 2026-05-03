import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ConnectorType } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getStorageAdapter } from '@/lib/connectors/registry'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'

const SUPPORT_FOLDER = 'support'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string }> }
) {
  const params = await context.params
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

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const firmSlug = formData.get('firmSlug') as string

    if (!file || !firmSlug) {
      return NextResponse.json(
        { error: 'Missing file or firmSlug' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Find firm and connector
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

    // Resolve firm folder ID
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

    // Build folder hierarchy: assets → support → <ticketNumber>
    const adapter = await getStorageAdapter(connector.id)
    const assetsId = await adapter.findOrCreateFolder(connector.id, firmFolderId, 'assets')
    const supportId = await adapter.findOrCreateFolder(connector.id, assetsId, SUPPORT_FOLDER)
    const ticketFolderId = await adapter.findOrCreateFolder(connector.id, supportId, params.ticketNumber)

    // Generate randomized filename
    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    const storedName = `${randomBytes(6).toString('hex')}${ext ? '.' + ext : ''}`

    // Upload file to Google Drive
    const accessToken = await googleDriveConnector.getAccessToken(connector.id)
    if (!accessToken) {
      console.error('Failed to get Google Drive access token for connector:', connector.id)
      return NextResponse.json(
        { error: 'Failed to get Google Drive access token' },
        { status: 500 }
      )
    }

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: storedName,
        mimeType: file.type || 'application/octet-stream',
        parents: [ticketFolderId],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create file in Google Drive:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      })
      return NextResponse.json(
        { error: 'Failed to create file in Google Drive' },
        { status: 500 }
      )
    }

    const googleResponse = await response.json() as { id: string }
    if (!googleResponse.id) {
      console.error('Google Drive response missing file id:', googleResponse)
      return NextResponse.json(
        { error: 'Google Drive response invalid' },
        { status: 500 }
      )
    }
    const driveFileId = googleResponse.id

    // Upload file content
    const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('Failed to upload file content to Google Drive:', {
        fileId: driveFileId,
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        body: errorText,
      })
      return NextResponse.json(
        { error: 'Failed to upload file content' },
        { status: 500 }
      )
    }

    console.log('Successfully uploaded file to Google Drive:', {
      ticketNumber: params.ticketNumber,
      fileName: file.name,
      driveFileId,
      size: file.size,
    })

    return NextResponse.json({
      success: true,
      meta: {
        originalName: file.name,
        storedName,
        driveFileId,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      },
    })
  } catch (error) {
    console.error('Failed to upload attachment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload attachment' },
      { status: 500 }
    )
  }
}
