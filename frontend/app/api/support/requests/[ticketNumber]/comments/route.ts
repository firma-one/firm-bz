import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketNumber: string }> }
) {
  const params = await context.params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content } = await request.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const ticket = await (prisma as any).customerRequest.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { id: true, comments: true },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const newComment = {
      id: crypto.randomUUID(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      authorEmail: user.email ?? '',
      authorName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    }

    const existing = Array.isArray(ticket.comments) ? ticket.comments : []
    const updated = [...existing, newComment]

    await (prisma as any).customerRequest.update({
      where: { ticketNumber: params.ticketNumber },
      data: { comments: updated },
    })

    return NextResponse.json({ comment: newComment, comments: updated })
  } catch (error) {
    console.error('Failed to add comment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add comment' },
      { status: 500 }
    )
  }
}
