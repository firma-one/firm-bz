import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string; driveFileId: string }> }
) {
  const params = await context.params
  try {
    // Support both cookie-based and Bearer token auth (for programmatic <a> clicks)
    const { searchParams } = new URL(request.url)
    const tokenParam = searchParams.get('token')
    const authHeader = request.headers.get('authorization')

    const token = tokenParam || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get ticket to find firm
    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, firmId: true, attachments: true },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Find the attachment metadata for the filename
    const attachments = (ticket.attachments as any[]) ?? []
    const attachment = attachments.find((a: any) => a.driveFileId === params.driveFileId)

    // Resolve connector from firm
    const firm = await prisma.firm.findUnique({
      where: { id: ticket.firmId || '' },
      select: { connectorId: true },
    })
    if (!firm?.connectorId) {
      return NextResponse.json({ error: 'No connector configured for firm' }, { status: 400 })
    }

    // Stream file from Google Drive
    const { stream, mimeType, size, name } = await googleDriveConnector.downloadFile(
      firm.connectorId,
      params.driveFileId
    )

    const finalName = attachment?.originalName || name
    const encodedFilename = encodeURIComponent(finalName).replace(/['()]/g, escape).replace(/\*/g, '%2A')

    const headers = new Headers()
    headers.set('Content-Type', mimeType || 'application/octet-stream')
    headers.set(
      'Content-Disposition',
      `attachment; filename="${finalName.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`
    )
    if (size && size !== '0') {
      headers.set('Content-Length', size)
    }

    return new NextResponse(stream, { status: 200, headers })
  } catch (error) {
    console.error('Failed to download support attachment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download attachment' },
      { status: 500 }
    )
  }
}
