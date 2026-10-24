import { parseSettingsFromDb } from '@/lib/sharing-settings'
import { engagementDocFilePath, engagementPath } from '@/lib/navigation/firm-paths'

/** What a notification is about, when it names a document or an engagement. */
export type NotificationSubject = 'deliverable' | 'document' | 'engagement'

const ENGAGEMENT_SELECT = {
    name: true,
    slug: true,
    client: { select: { name: true, slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } },
} as const

type EngagementPlace = {
    name: string
    slug: string
    client: { name: string; slug: string; firm: { slug: string; group: { slug: string } | null } | null } | null
}

/** True once a folder is tagged as a Deliverable (settings.share.createdAt), as the Board decides. */
export function isDeliverableFolder(doc: { isFolder: boolean; settings: unknown }): boolean {
    if (!doc.isFolder) return false
    try {
        return !!parseSettingsFromDb(doc.settings as any).share?.createdAt
    } catch {
        return false
    }
}

/** A document's place in the app: a deliverable's card on the Board, or the document in Files. */
export function documentLink(
    slugs: { groupSlug: string; firmSlug: string; clientSlug: string; engagementSlug: string },
    doc: { id: string; deliverable: boolean },
): string {
    const { groupSlug, firmSlug, clientSlug, engagementSlug } = slugs
    return doc.deliverable
        ? engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug, { tab: 'shares', subpath: 'board', hash: `doc-file:${doc.id}` })
        : engagementDocFilePath(groupSlug, firmSlug, clientSlug, engagementSlug, doc.id)
}

function slugsOf(e: EngagementPlace) {
    const groupSlug = e.client?.firm?.group?.slug
    const firmSlug = e.client?.firm?.slug
    const clientSlug = e.client?.slug
    return groupSlug && firmSlug && clientSlug && e.slug ? { groupSlug, firmSlug, clientSlug, engagementSlug: e.slug } : null
}

export type NotificationPlace = {
    subject?: NotificationSubject
    subjectName?: string | null
    clientName?: string | null
    engagementName?: string | null
}

type Placeable = { documentId?: string | null; engagementId?: string | null; ctaUrl?: string | null }

/**
 * Fills in what the Inbox needs to place a notification that names a document or an engagement:
 * - `subject`: a deliverable, a document, or the engagement itself, and `subjectName` (the file's);
 * - `clientName` and `engagementName`: where it sits, for its chips;
 * - `ctaUrl`, for rows stored without one (a due date set on a document, before 2026-10-23): the
 *   deliverable's Board card, the document in Files, or the engagement.
 * Read with the caller's RLS client, so a row whose document or engagement they can no longer read
 * is left as it was. Never throws.
 */
export async function placeNotifications<T extends Placeable>(
    prisma: any,
    rows: T[],
): Promise<(T & NotificationPlace)[]> {
    const docIds = Array.from(new Set(rows.map((r) => r.documentId).filter((id): id is string => !!id)))
    const engIds = Array.from(new Set(
        rows.filter((r) => !r.documentId && r.engagementId).map((r) => r.engagementId as string)
    ))
    if (docIds.length === 0 && engIds.length === 0) return rows

    try {
        const [docs, engagements] = await Promise.all([
            docIds.length
                ? prisma.engagementDocument.findMany({
                    where: { id: { in: docIds } },
                    select: { id: true, fileName: true, isFolder: true, settings: true, engagement: { select: ENGAGEMENT_SELECT } },
                })
                : [],
            engIds.length
                ? prisma.engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, ...ENGAGEMENT_SELECT } })
                : [],
        ])
        const docById = new Map<string, { id: string; fileName: string; isFolder: boolean; settings: unknown; engagement: EngagementPlace | null }>(
            docs.map((d: { id: string }) => [d.id, d])
        )
        const engById = new Map<string, EngagementPlace>(engagements.map((e: { id: string }) => [e.id, e]))

        return rows.map((row) => {
            const doc = row.documentId ? docById.get(row.documentId) : undefined
            const engagement = doc ? doc.engagement : row.engagementId ? engById.get(row.engagementId) : undefined
            if (!engagement || (row.documentId && !doc)) return row
            const deliverable = !!doc && isDeliverableFolder(doc)
            const subject: NotificationSubject = doc ? (deliverable ? 'deliverable' : 'document') : 'engagement'
            const slugs = slugsOf(engagement)
            const link = slugs
                ? doc
                    ? documentLink(slugs, { id: doc.id, deliverable })
                    : engagementPath(slugs.groupSlug, slugs.firmSlug, slugs.clientSlug, slugs.engagementSlug)
                : null
            return {
                ...row,
                subject,
                subjectName: doc?.fileName ?? null,
                clientName: engagement.client?.name ?? null,
                engagementName: engagement.name,
                ctaUrl: row.ctaUrl || link,
            }
        })
    } catch {
        return rows
    }
}
