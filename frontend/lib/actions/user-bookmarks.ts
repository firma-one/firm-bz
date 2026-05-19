'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

export type BookmarkWithContext = {
  id: string
  kind: 'document' | 'project' | 'comment' | 'url'
  label?: string
  url?: string
  clientId?: string
  projectId?: string
  documentId?: string
  createdAt: string
  // enriched from projectId
  engagementName?: string
  engagementSlug?: string
  clientName?: string
  clientSlug?: string
  firmSlug?: string
}

export async function getUserBookmarks(): Promise<BookmarkWithContext[]> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return []

  const row = await prisma.userPersonalization.findUnique({
    where: { userId: user.id },
    select: { bookmarks: true },
  })

  const raw = Array.isArray(row?.bookmarks) ? (row!.bookmarks as any[]) : []

  // Batch-resolve engagement context for bookmarks that have a projectId
  const projectIds = [...new Set(raw.filter((b) => b.projectId).map((b) => b.projectId as string))]

  const engagements = projectIds.length > 0
    ? await (prisma as any).engagement.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          client: { select: { name: true, slug: true, firm: { select: { slug: true } } } },
        },
      })
    : []

  const engMap = new Map<string, any>(engagements.map((e: any) => [e.id, e]))

  return raw.map((b: any): BookmarkWithContext => {
    const eng = b.projectId ? engMap.get(b.projectId) : null
    return {
      id: b.id,
      kind: b.kind,
      label: b.label,
      url: b.url,
      clientId: b.clientId,
      projectId: b.projectId,
      documentId: b.documentId,
      createdAt: b.createdAt ?? new Date(0).toISOString(),
      engagementName: eng?.name,
      engagementSlug: eng?.slug,
      clientName: eng?.client?.name,
      clientSlug: eng?.client?.slug,
      firmSlug: eng?.client?.firm?.slug,
    }
  })
}
