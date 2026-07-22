import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string; driveFileId: string }> }
) {
  const params = await context.params
  try {
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

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the ticket
    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, attachments: true, firmId: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Get firm connector
    const firm = await prisma.firm.findUnique({
      where: { id: ticket.firmId || '' },
      select: { connectorId: true },
    })

    if (!firm?.connectorId) {
      return NextResponse.json(
        { error: 'No connector configured for firm' },
        { status: 400 }
      )
    }

    // Delete from Google Drive (permanent — support attachments don't use trash)
    const permissionAdapter = await getPermissionAdapter(firm.connectorId)
    if (permissionAdapter) {
      await permissionAdapter.deleteFile(firm.connectorId, params.driveFileId, { permanent: true }).catch((err) => {
        console.warn(`Failed to delete file from Google Drive: ${err instanceof Error ? err.message : String(err)}`)
      })
    }

    // Remove from DB
    const updatedAttachments = (ticket.attachments as any[]).filter(
      (a) => a.driveFileId !== params.driveFileId
    )

    await (prisma as any).customerRequest.update({
      where: { ticketNumber: params.ticketNumber },
      data: { attachments: updatedAttachments },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete attachment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete attachment' },
      { status: 500 }
    )
  }
}
