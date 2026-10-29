import 'server-only'
import { prisma } from '@/lib/prisma'
import { parseSettingsFromDb } from '@/lib/sharing-settings'

export interface DeliverableRef {
    id: string
    docId: string | null
    name: string
}

function isDeliverable(settings: unknown): boolean {
    try {
        return !!parseSettingsFromDb(settings).share?.createdAt
    } catch {
        return false
    }
}

/**
 * The deliverable a document is in: the nearest folder above it tagged as one (`parentId` holds the
 * parent's provider externalId, as in the Discussions route and calendar-data.ts). Null for a
 * document outside any deliverable, and for a deliverable itself.
 *
 * Discussions happen on the deliverable, with its documents tagged by "#" — so a document's own
 * Discussions tab opens this thread (.claude/plans/engagement-assets-details.md).
 */
export async function deliverableOf(engagementId: string, parentId: string | null): Promise<DeliverableRef | null> {
    if (!parentId) return null
    const folders = await prisma.engagementDocument.findMany({
        where: { engagementId, isFolder: true },
        select: { id: true, externalId: true, parentId: true, docId: true, fileName: true, settings: true },
    })
    const byExternalId = new Map(folders.map((f) => [f.externalId, f]))
    // Bounded: a cycle in provider data must not hang the request.
    for (let current: string | null = parentId, hops = 0; current && hops < 50; hops++) {
        const folder = byExternalId.get(current)
        if (!folder) return null
        if (isDeliverable(folder.settings)) return { id: folder.id, docId: folder.docId ?? null, name: folder.fileName }
        current = folder.parentId
    }
    return null
}
