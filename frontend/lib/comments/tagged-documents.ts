import { prisma } from '@/lib/prisma'
import { taggedDocIds } from '@/lib/comments/mentions'

/** A document tagged with "#" in a comment, as its chip shows it: ID and icon, name on hover. */
export type TaggedDocument = { docId: string; fileName: string; mimeType: string | null }

/**
 * The documents tagged in these comments that the viewer may access, by doc ID, so a list of
 * comments can draw its tags as chips. `visible` is the viewer's documents by external ID
 * (visibleDocumentIdsFor); null when they may access them all. A tag of a document they can't
 * access, or that is gone, stays out and is drawn as plain "#ID".
 */
export async function taggedDocumentsIn(
    engagementId: string,
    contents: string[],
    visible: Set<string> | null,
): Promise<Record<string, TaggedDocument>> {
    const ids = Array.from(new Set(contents.flatMap(taggedDocIds)))
    if (ids.length === 0) return {}
    const docs = await prisma.engagementDocument.findMany({
        where: { engagementId, docId: { in: ids } },
        select: { docId: true, fileName: true, mimeType: true, externalId: true },
    })
    return Object.fromEntries(
        docs
            .filter((d) => d.docId && (!visible || visible.has(d.externalId)))
            .map((d) => [d.docId!, { docId: d.docId!, fileName: d.fileName, mimeType: d.mimeType ?? null }]),
    )
}
