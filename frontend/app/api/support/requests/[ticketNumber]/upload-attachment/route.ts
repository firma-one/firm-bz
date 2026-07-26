import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { randomBytes, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { canAccessSupportTicket } from '@/lib/support-ticket-auth'

/**
 * Support ticket attachments are stored as DB blobs (base64 data URL in the ticket's
 * `attachments` JSONB column), mirroring Brand.logoData — not in Google Drive. Support
 * tickets are firm-level (no client/engagement selection in the request form), so there is
 * no reliable client connector to route them through; a single storage path avoids a
 * permanent Drive-vs-blob branch across every attachment code path for what is internal
 * operational data, not a client deliverable.
 */
const MAX_BLOB_ATTACHMENT_BYTES = 8 * 1024 * 1024 // 8MB

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

    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { userId: true, firmId: true },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    if (!(await canAccessSupportTicket(user.id, ticket))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Reject clearly-oversized requests before buffering the body — formData() has to read
    // the whole multipart payload to parse it, so this Content-Length check is the only
    // point we can cheaply short-circuit an oversized upload before that happens.
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BLOB_ATTACHMENT_BYTES * 2) {
      // *2 for multipart boundary/header overhead; the exact file.size check below is authoritative.
      return NextResponse.json(
        { error: `File too large (max ${MAX_BLOB_ATTACHMENT_BYTES / 1024 / 1024}MB)` },
        { status: 413 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (file.size > MAX_BLOB_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BLOB_ATTACHMENT_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'application/octet-stream'

    // Our own stable attachment id + a randomized stored filename (independent of any storage backend)
    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    const storedName = `${randomBytes(6).toString('hex')}${ext ? '.' + ext : ''}`
    const attachmentId = randomUUID()
    const blobData = `data:${mimeType};base64,${buffer.toString('base64')}`

    return NextResponse.json({
      success: true,
      meta: {
        attachmentId,
        originalName: file.name,
        storedName,
        blobData,
        mimeType,
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
