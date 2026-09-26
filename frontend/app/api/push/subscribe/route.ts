import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import type { StoredPushSubscription } from '@/lib/push'

/**
 * POST /api/push/subscribe
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 * Stores a new push subscription for the current user (one entry per device/browser).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null
  const keys = body.keys
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'endpoint and keys.{p256dh,auth} are required' }, { status: 400 })
  }

  const personalization = await prisma.userPersonalization.findUnique({
    where: { userId: user.id },
    select: { pushSubscriptions: true },
  })
  const existing: StoredPushSubscription[] = Array.isArray(personalization?.pushSubscriptions)
    ? (personalization!.pushSubscriptions as unknown as StoredPushSubscription[])
    : []

  const withoutDuplicate = existing.filter((s) => s.endpoint !== endpoint)
  const nextSubscription: StoredPushSubscription = {
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    createdAt: new Date().toISOString(),
  }

  await prisma.userPersonalization.upsert({
    where: { userId: user.id },
    create: { userId: user.id, pushSubscriptions: [nextSubscription] as any },
    update: { pushSubscriptions: [...withoutDuplicate, nextSubscription] as any },
  })

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/push/subscribe
 * Body: { endpoint: string }
 * Removes a push subscription for the current user (e.g. when they revoke permission).
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

  const personalization = await prisma.userPersonalization.findUnique({
    where: { userId: user.id },
    select: { pushSubscriptions: true },
  })
  const existing: StoredPushSubscription[] = Array.isArray(personalization?.pushSubscriptions)
    ? (personalization!.pushSubscriptions as unknown as StoredPushSubscription[])
    : []
  const remaining = existing.filter((s) => s.endpoint !== endpoint)

  if (remaining.length !== existing.length) {
    await prisma.userPersonalization.update({
      where: { userId: user.id },
      data: { pushSubscriptions: remaining as any },
    })
  }

  return NextResponse.json({ ok: true })
}
