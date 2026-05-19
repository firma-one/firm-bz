import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

type Bookmark = {
  id: string
  kind: 'document' | 'project' | 'comment' | 'url'
  label?: string
  url?: string
  clientId?: string
  projectId?: string
  documentId?: string
  createdAt: string
}

function shouldPreferInternalDeeplink(bookmark: Partial<Bookmark>): boolean {
  const kind = bookmark.kind
  if (kind === 'document') return Boolean(bookmark.projectId && bookmark.documentId)
  if (kind === 'comment') return Boolean(bookmark.projectId && bookmark.documentId)
  if (kind === 'project') return Boolean(bookmark.projectId)
  return false
}

function normalizeBookmarkInput(bookmark: Partial<Bookmark>): Partial<Bookmark> {
  // If we have enough IDs to resolve an internal deeplink later, we should NOT persist
  // Google Drive URLs (or any external URL). UI resolves via /api/deeplink at click-time.
  if (shouldPreferInternalDeeplink(bookmark)) {
    return { ...bookmark, url: undefined }
  }
  return bookmark
}

async function getOrCreate(userId: string) {
  const row = await prisma.userPersonalization.upsert({
    where: { userId },
    update: {},
    create: { userId, bookmarks: [] as any },
    select: { userId: true, bookmarks: true },
  })
  return row
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await getOrCreate(user.id)
  const existing = Array.isArray(row.bookmarks) ? (row.bookmarks as any[]) : []
  const normalized = existing.map((b) => normalizeBookmarkInput(b as Partial<Bookmark>))

  // Persist a lightweight migration so existing Drive URL bookmarks start behaving as internal deeplinks.
  try {
    const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
    if (changed) {
      await prisma.userPersonalization.update({
        where: { userId: user.id },
        data: { bookmarks: normalized as any },
      })
    }
  } catch {
    // ignore migration failures
  }

  return NextResponse.json({ bookmarks: normalized })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const bookmark = normalizeBookmarkInput(body?.bookmark as Partial<Bookmark>)
  if (!bookmark?.kind) return NextResponse.json({ error: 'Invalid bookmark' }, { status: 400 })
  const hasResolvableTarget =
    (bookmark.kind === 'document' && Boolean(bookmark.projectId && bookmark.documentId)) ||
    (bookmark.kind === 'project' && Boolean(bookmark.projectId)) ||
    (bookmark.kind === 'comment' && Boolean(bookmark.projectId && bookmark.documentId))
  if (!bookmark.url && !hasResolvableTarget) {
    return NextResponse.json({ error: 'Invalid bookmark' }, { status: 400 })
  }

  const row = await getOrCreate(user.id)
  const existing = Array.isArray(row.bookmarks) ? (row.bookmarks as any[]) : []
  const next: Bookmark = {
    id: (bookmark.id as string) || crypto.randomUUID(),
    kind: bookmark.kind as any,
    label: bookmark.label,
    url: bookmark.url,
    clientId: bookmark.clientId,
    projectId: bookmark.projectId,
    documentId: bookmark.documentId,
    createdAt: new Date().toISOString(),
  }
  if (existing.length >= 50) {
    return NextResponse.json(
      { error: 'Bookmarks are capped at 50. Remove older or unused ones to add more.' },
      { status: 409 }
    )
  }

  const updated = [next, ...existing].slice(0, 50)
  await prisma.userPersonalization.update({ where: { userId: user.id }, data: { bookmarks: updated as any } })

  return NextResponse.json({ success: true, bookmark: next })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = body?.id as string | undefined
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const row = await getOrCreate(user.id)
  const existing = Array.isArray(row.bookmarks) ? (row.bookmarks as any[]) : []
  const updated = existing.filter((b) => b?.id !== id)
  await prisma.userPersonalization.update({ where: { userId: user.id }, data: { bookmarks: updated as any } })

  return NextResponse.json({ success: true })
}

