import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'

export async function PATCH(
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

    // Parse request body
    const { attachments } = await request.json()
    if (!Array.isArray(attachments)) {
      return NextResponse.json({ error: 'attachments must be an array' }, { status: 400 })
    }

    // Find the ticket
    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, attachments: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Merge new attachments with existing (supports retries)
    const existingAttachments = Array.isArray(ticket.attachments) ? ticket.attachments : []
    const merged = [...existingAttachments, ...attachments]

    // Update ticket with merged attachments
    await (prisma as any).customerRequest.update({
      where: { ticketNumber: params.ticketNumber },
      data: { attachments: merged },
    })

    return NextResponse.json({ success: true, count: attachments.length })
  } catch (error) {
    console.error('Failed to update ticket attachments:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update attachments' },
      { status: 500 }
    )
  }
}

/** Removes a single attachment from a ticket's attachments list by attachmentId. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string }> }
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
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { attachmentId } = await request.json()
    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 })
    }

    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, attachments: true },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const existingAttachments: any[] = Array.isArray(ticket.attachments) ? ticket.attachments : []
    const remaining = existingAttachments.filter(a => a.attachmentId !== attachmentId)

    await (prisma as any).customerRequest.update({
      where: { ticketNumber: params.ticketNumber },
      data: { attachments: remaining },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove ticket attachment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove attachment' },
      { status: 500 }
    )
  }
}
